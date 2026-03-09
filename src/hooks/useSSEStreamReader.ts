import { useCallback } from "react";
import { parseSSELines } from "@/lib/sse-reader";
import { extractSentences } from "@/lib/split-text";
import type { PendingPermission, ProcessingState, SSEChunk } from "@/types/chat";

interface UseSSEStreamReaderOptions {
  onPermissionRequest: (permission: PendingPermission) => void;
  onTextDelta: (deltaText: string) => void;
  onError: (errorText: string) => void;
  onProcessingState: (state: ProcessingState) => void;
  onResult: () => void;
  onSentence: (sentence: string) => void;
}

export function useSSEStreamReader({
  onPermissionRequest,
  onTextDelta,
  onError,
  onProcessingState,
  onResult,
  onSentence,
}: UseSSEStreamReaderOptions) {
  const readSSEStream = useCallback(
    async (body: ReadableStream<Uint8Array>, streamToTts: boolean): Promise<string> => {
      const reader = body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let fullText = "";
      let sentenceBuffer = "";

      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const { chunks, remaining } = parseSSELines(buffer);
        buffer = remaining;

        for (const chunk of chunks) {
          handleChunk({
            chunk,
            onPermissionRequest,
            onTextDelta,
            onError,
            onProcessingState,
            onResult,
          });

          if (chunk.type === "text_delta") {
            fullText += chunk.text;
            if (streamToTts) {
              sentenceBuffer += chunk.text;
              const { sentences, remaining: sentenceRemaining } =
                extractSentences(sentenceBuffer);
              sentenceBuffer = sentenceRemaining;
              for (const sentence of sentences) {
                onSentence(sentence);
              }
            }
          }
        }
      }

      if (streamToTts && sentenceBuffer.trim()) {
        onSentence(sentenceBuffer.trim());
      }

      return fullText;
    },
    [
      onError,
      onPermissionRequest,
      onProcessingState,
      onResult,
      onSentence,
      onTextDelta,
    ]
  );

  return { readSSEStream };
}

interface HandleChunkParams {
  chunk: SSEChunk;
  onPermissionRequest: (permission: PendingPermission) => void;
  onTextDelta: (deltaText: string) => void;
  onError: (errorText: string) => void;
  onProcessingState: (state: ProcessingState) => void;
  onResult: () => void;
}

function handleChunk({
  chunk,
  onPermissionRequest,
  onTextDelta,
  onError,
  onProcessingState,
  onResult,
}: HandleChunkParams): void {
  if (chunk.type === "permission_request") {
    onPermissionRequest({
      requestId: chunk.requestId,
      toolName: chunk.toolName,
      input: chunk.input,
      description: chunk.description,
    });
    return;
  }

  if (chunk.type === "text_delta") {
    onTextDelta(chunk.text);
    return;
  }

  if (chunk.type === "error") {
    onError(chunk.error);
    return;
  }

  if (chunk.type === "processing_state") {
    if (chunk.state === "text") {
      onProcessingState(null);
      return;
    }
    if (chunk.state === "thinking") {
      onProcessingState({ type: "thinking" });
      return;
    }
    if (typeof chunk.toolName !== "string") {
      throw new Error("toolName is required for tool_use processing state");
    }
    onProcessingState({ type: "tool_use", toolName: chunk.toolName });
    return;
  }

  if (chunk.type === "result") {
    onResult();
  }
}
