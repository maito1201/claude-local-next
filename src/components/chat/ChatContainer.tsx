"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { MessageList } from "./MessageList";
import { MessageInput } from "./MessageInput";
import { TtsSettingsPanel } from "./TtsSettingsPanel";
import { PermissionDialog } from "./PermissionDialog";
import { useSpeechRecognition } from "@/hooks/useSpeechRecognition";
import { useTts } from "@/hooks/useTts";
import { usePermission } from "@/hooks/usePermission";
import { useSSEStreamReader } from "@/hooks/useSSEStreamReader";
import type { ChatMessage, ProcessingState } from "@/types/chat";

const CHAT_API_ENDPOINT = "/api/chat";

export function ChatContainer() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const abortControllerRef = useRef<AbortController | null>(null);
  const assistantMessageIdRef = useRef<string | null>(null);
  const [ttsEnabled, setTtsEnabled] = useState(false);
  const ttsEnabledRef = useRef(false);
  const [ttsSettingsOpen, setTtsSettingsOpen] = useState(false);
  const [processingState, setProcessingState] = useState<ProcessingState>(null);
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
    assistantMessageIdRef.current = assistantId;

    setMessages((prev) => [...prev, userMessage, assistantMessage]);
    setProcessingState({ type: "processing" });

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
      setProcessingState(null);
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
      if (!controller.signal.aborted) {
        setProcessingState(null);
        if (!ttsEnabledRef.current) {
          resumeVoice();
        }
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

  const toggleVoiceMode = useCallback(() => {
    if (voiceMode) {
      disableVoiceMode();
    } else {
      enableVoiceMode();
    }
  }, [voiceMode, enableVoiceMode, disableVoiceMode]);

  useEffect(() => {
    if (!voiceError || !voiceMode) {
      return;
    }
    disableVoiceMode();
  }, [voiceError, voiceMode, disableVoiceMode]);

  const toggleTts = useCallback(() => {
    const next = !ttsEnabledRef.current;
    ttsEnabledRef.current = next;
    setTtsEnabled(next);
    if (!next) {
      stopTts();
    }
  }, [stopTts]);
  const updateAssistantMessage = useCallback(
    (updater: (currentContent: string) => string) => {
      const assistantId = assistantMessageIdRef.current;
      if (!assistantId) {
        return;
      }
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantId ? { ...m, content: updater(m.content) } : m
        )
      );
    },
    []
  );

  const { readSSEStream } = useSSEStreamReader({
    onPermissionRequest: setPendingPermission,
    onTextDelta: (deltaText) => {
      updateAssistantMessage((content) => content + deltaText);
    },
    onError: (errorText) => {
      setProcessingState(null);
      updateAssistantMessage(() => `エラー: ${errorText}`);
    },
    onProcessingState: setProcessingState,
    onResult: () => {
      setProcessingState(null);
    },
    onSentence: enqueueTts,
  });

  return (
    <div className="flex flex-col h-screen max-w-3xl mx-auto">
      <MessageList messages={messages} processingState={processingState} />
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
