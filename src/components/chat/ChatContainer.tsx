"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { MessageList } from "./MessageList";
import { MessageInput } from "./MessageInput";
import { TtsSettingsPanel } from "./TtsSettingsPanel";
import { PermissionDialog } from "./PermissionDialog";
import { parseSSELines } from "@/lib/sse-reader";
import { extractSentences } from "@/lib/split-text";
import { useSpeechRecognition } from "@/hooks/useSpeechRecognition";
import { useTts } from "@/hooks/useTts";
import { usePermission } from "@/hooks/usePermission";
import type { ChatMessage } from "@/types/chat";

const CHAT_API_ENDPOINT = "/api/chat";

export function ChatContainer() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const abortControllerRef = useRef<AbortController | null>(null);
  const [ttsEnabled, setTtsEnabled] = useState(false);
  const ttsEnabledRef = useRef(false);
  const [ttsSettingsOpen, setTtsSettingsOpen] = useState(false);
  const { pendingPermission, setPendingPermission, handlePermissionResponse } =
    usePermission();

  const handleSend = useCallback(async (text: string) => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: text,
    };

    const assistantId = crypto.randomUUID();
    const assistantMessage: ChatMessage = {
      id: assistantId,
      role: "assistant",
      content: "",
    };

    setMessages((prev) => [...prev, userMessage, assistantMessage]);

    const controller = new AbortController();
    abortControllerRef.current = controller;

    suspendVoice();
    stopTts();

    try {
      const response = await fetch(CHAT_API_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text }),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      if (!response.body) {
        throw new Error("Response body is null");
      }

      const shouldStream = ttsEnabledRef.current;

      const fullText = await readSSEStream(
        response.body,
        assistantId,
        shouldStream
      );

      if (shouldStream) {
        // Streaming TTS: signal that no more sentences will come
        finishTtsStream();
      } else if (ttsEnabledRef.current && fullText) {
        // Fallback: TTS was enabled after streaming started
        speak(fullText);
        return;
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        return;
      }

      const errorText =
        err instanceof Error ? err.message : "Unknown error";
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantId
            ? { ...m, content: `エラー: ${errorText}` }
            : m
        )
      );
    } finally {
      abortControllerRef.current = null;
      // AbortError means a new request replaced this one; that request handles voice restart
      // TTS再生中は音声認識を再開しない（onTtsEnd で再開する）
      if (!controller.signal.aborted && !ttsEnabledRef.current) {
        resumeVoice();
      }
    }
  }, []);

  const {
    enableVoiceMode,
    disableVoiceMode,
    suspend: suspendVoice,
    resume: resumeVoice,
    voiceMode,
    isSupported: isVoiceSupported,
    transcript,
    error: voiceError,
  } = useSpeechRecognition({ onResult: handleSend });

  const onTtsEnd = useCallback(() => {
    resumeVoice();
  }, [resumeVoice]);

  const {
    speak,
    enqueue: enqueueTts,
    finishStream: finishTtsStream,
    stop: stopTts,
    isSpeaking,
    isSupported: isTtsSupported,
    settings: ttsSettings,
    updateSettings: updateTtsSettings,
    speakers,
    browserVoices,
    speakerLoadError,
    speakError,
    refetchSpeakers,
  } = useTts({ onEnd: onTtsEnd });

  // voiceError時にvoiceModeをリセット
  useEffect(() => {
    if (voiceError) {
      disableVoiceMode();
    }
  }, [voiceError, disableVoiceMode]);

  const toggleVoiceMode = useCallback(() => {
    if (voiceMode) {
      disableVoiceMode();
    } else {
      enableVoiceMode();
    }
  }, [voiceMode, enableVoiceMode, disableVoiceMode]);

  const toggleTts = useCallback(() => {
    const next = !ttsEnabledRef.current;
    ttsEnabledRef.current = next;
    setTtsEnabled(next);
    if (!next) {
      stopTts();
    }
  }, [stopTts]);

  async function readSSEStream(
    body: ReadableStream<Uint8Array>,
    assistantId: string,
    streamToTts: boolean
  ): Promise<string> {
    const reader = body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let fullText = "";
    // Buffer for sentence extraction (streaming TTS)
    let sentenceBuffer = "";

    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const { chunks, remaining } = parseSSELines(buffer);
      buffer = remaining;

      for (const chunk of chunks) {
        if (chunk.type === "permission_request") {
          setPendingPermission({
            requestId: chunk.requestId,
            toolName: chunk.toolName,
            input: chunk.input,
            description: chunk.description,
          });
        }

        if (chunk.type === "text_delta") {
          const deltaText = chunk.text;
          fullText += deltaText;
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId
                ? { ...m, content: m.content + deltaText }
                : m
            )
          );

          // Streaming TTS: extract complete sentences and enqueue immediately
          if (streamToTts) {
            sentenceBuffer += deltaText;
            const { sentences, remaining: sentenceRemaining } =
              extractSentences(sentenceBuffer);
            sentenceBuffer = sentenceRemaining;

            for (const sentence of sentences) {
              enqueueTts(sentence);
            }
          }
        }

        if (chunk.type === "error") {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId
                ? { ...m, content: `エラー: ${chunk.error}` }
                : m
            )
          );
        }
      }
    }

    // Flush remaining sentence buffer to TTS
    if (streamToTts && sentenceBuffer.trim()) {
      enqueueTts(sentenceBuffer.trim());
    }

    return fullText;
  }

  return (
    <div className="flex flex-col h-screen max-w-3xl mx-auto">
      <MessageList messages={messages} />
      {speakError && (
        <div className="px-4 py-2 bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 text-sm">
          {speakError}
        </div>
      )}
      <MessageInput
        onSend={handleSend}
        voiceMode={voiceMode}
        onToggleVoiceMode={toggleVoiceMode}
        isVoiceSupported={isVoiceSupported}
        transcript={transcript}
        ttsEnabled={ttsEnabled}
        isSpeaking={isSpeaking}
        onToggleTts={toggleTts}
        isTtsSupported={isTtsSupported}
        onOpenTtsSettings={() => setTtsSettingsOpen(true)}
      />
      {ttsSettingsOpen && (
        <TtsSettingsPanel
          settings={ttsSettings}
          onUpdateSettings={updateTtsSettings}
          speakers={speakers}
          browserVoices={browserVoices}
          speakerLoadError={speakerLoadError}
          onRefetchSpeakers={refetchSpeakers}
          onClose={() => setTtsSettingsOpen(false)}
        />
      )}
      {pendingPermission && (
        <PermissionDialog
          pendingPermission={pendingPermission}
          onRespond={handlePermissionResponse}
        />
      )}
    </div>
  );
}
