import { useState, useRef, useEffect, useCallback } from "react";
import { splitTextIntoChunks, CHUNK_MAX_LENGTH } from "@/lib/split-text";
import {
  synthesize,
  VoicevoxConnectionError,
} from "@/lib/voicevox-client";

interface UseVoicevoxOptions {
  onEnd: () => void;
  speakerId: number | null;
  speedScale: number;
  volume: number;
}

interface UseVoicevoxReturn {
  speak: (text: string) => void;
  enqueue: (text: string) => void;
  finishStream: () => void;
  stop: () => void;
  isSpeaking: boolean;
  error: string | null;
}

export function useVoicevox({
  onEnd,
  speakerId,
  speedScale,
  volume,
}: UseVoicevoxOptions): UseVoicevoxReturn {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onEndRef = useRef(onEnd);
  const speakIdRef = useRef(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const objectUrlRef = useRef<string | null>(null);
  const speakerIdRef = useRef(speakerId);
  const speedScaleRef = useRef(speedScale);
  const volumeRef = useRef(volume);

  // Queue state for streaming TTS
  const queueRef = useRef<string[]>([]);
  const isProcessingRef = useRef(false);
  const streamFinishedRef = useRef(false);
  // Pre-buffer: holds a promise for the next chunk's audio
  const prefetchedBufferRef = useRef<Promise<ArrayBuffer> | null>(null);
  const prefetchedIndexRef = useRef<number>(-1);

  onEndRef.current = onEnd;
  speakerIdRef.current = speakerId;
  speedScaleRef.current = speedScale;
  volumeRef.current = volume;

  const cleanupAudio = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }
  }, []);

  const resetQueue = useCallback(() => {
    queueRef.current = [];
    isProcessingRef.current = false;
    streamFinishedRef.current = false;
    prefetchedBufferRef.current = null;
    prefetchedIndexRef.current = -1;
  }, []);

  const stop = useCallback(() => {
    speakIdRef.current += 1;
    setIsSpeaking(false);
    cleanupAudio();
    resetQueue();
  }, [cleanupAudio, resetQueue]);

  /**
   * Play a single audio buffer and return a promise that resolves when playback ends.
   */
  const playBuffer = useCallback(
    (buffer: ArrayBuffer, currentId: number): Promise<void> => {
      return new Promise((resolve, reject) => {
        if (currentId !== speakIdRef.current) {
          resolve();
          return;
        }

        const blob = new Blob([buffer], { type: "audio/wav" });
        const url = URL.createObjectURL(blob);
        objectUrlRef.current = url;

        const audio = new Audio(url);
        audioRef.current = audio;

        audio.onended = () => {
          URL.revokeObjectURL(url);
          objectUrlRef.current = null;
          audioRef.current = null;
          resolve();
        };

        audio.onerror = () => {
          URL.revokeObjectURL(url);
          objectUrlRef.current = null;
          audioRef.current = null;
          reject(new Error("音声の再生に失敗しました"));
        };

        audio.play().catch(reject);
      });
    },
    []
  );

  /**
   * Synthesize a text chunk via VOICEVOX API.
   */
  const synthesizeChunk = useCallback(
    (text: string): Promise<ArrayBuffer> => {
      return synthesize(
        text,
        speakerIdRef.current!,
        speedScaleRef.current,
        volumeRef.current
      );
    },
    []
  );

  /**
   * Process queued chunks sequentially with pre-buffering.
   * Called when a new chunk is enqueued or when the previous chunk finishes.
   */
  const processQueue = useCallback(
    async (currentId: number) => {
      if (isProcessingRef.current) return;
      isProcessingRef.current = true;

      try {
        let queueIndex = 0;

        while (currentId === speakIdRef.current) {
          // Wait for a chunk to be available
          if (queueIndex >= queueRef.current.length) {
            // If stream is finished and no more chunks, we're done
            if (streamFinishedRef.current) {
              break;
            }
            // Otherwise, wait a bit and check again
            await new Promise((resolve) => setTimeout(resolve, 50));
            continue;
          }

          const chunkText = queueRef.current[queueIndex];

          // Get audio buffer: use prefetch if available, otherwise synthesize
          let buffer: ArrayBuffer;
          if (
            prefetchedBufferRef.current !== null &&
            prefetchedIndexRef.current === queueIndex
          ) {
            buffer = await prefetchedBufferRef.current;
            prefetchedBufferRef.current = null;
            prefetchedIndexRef.current = -1;
          } else {
            buffer = await synthesizeChunk(chunkText);
          }

          if (currentId !== speakIdRef.current) break;

          // Pre-fetch next chunk if available
          const nextIndex = queueIndex + 1;
          if (
            nextIndex < queueRef.current.length &&
            prefetchedIndexRef.current !== nextIndex
          ) {
            prefetchedIndexRef.current = nextIndex;
            prefetchedBufferRef.current = synthesizeChunk(
              queueRef.current[nextIndex]
            );
          }

          // Play current chunk
          await playBuffer(buffer, currentId);

          if (currentId !== speakIdRef.current) break;

          queueIndex++;
        }
      } catch (err) {
        if (currentId !== speakIdRef.current) return;
        setError(
          err instanceof VoicevoxConnectionError
            ? err.message
            : `音声合成に失敗しました: ${err instanceof Error ? err.message : String(err)}`
        );
      } finally {
        if (currentId === speakIdRef.current) {
          setIsSpeaking(false);
          isProcessingRef.current = false;
          onEndRef.current();
        }
      }
    },
    [synthesizeChunk, playBuffer]
  );

  /**
   * Enqueue a text segment for streaming TTS.
   * Starts processing automatically if not already running.
   */
  const enqueue = useCallback(
    (text: string) => {
      if (speakerIdRef.current === null) {
        setError("キャラクターが選択されていません");
        return;
      }

      // Split long text into sub-chunks
      const subChunks = splitTextIntoChunks(text, CHUNK_MAX_LENGTH);
      const wasEmpty = queueRef.current.length === 0;
      queueRef.current.push(...subChunks);

      if (!isProcessingRef.current) {
        if (wasEmpty) {
          // First enqueue: initialize speaking session
          speakIdRef.current += 1;
          streamFinishedRef.current = false;
          setIsSpeaking(true);
          setError(null);
        }
        const currentId = speakIdRef.current;
        processQueue(currentId);
      } else {
        // Processing is running; try to prefetch the next chunk if we can
        const nextIdx = queueRef.current.length - subChunks.length;
        if (
          prefetchedBufferRef.current === null &&
          nextIdx < queueRef.current.length
        ) {
          prefetchedIndexRef.current = nextIdx;
          prefetchedBufferRef.current = synthesizeChunk(
            queueRef.current[nextIdx]
          );
        }
      }
    },
    [processQueue, synthesizeChunk]
  );

  /**
   * Signal that no more text will be enqueued for the current stream.
   */
  const finishStream = useCallback(() => {
    streamFinishedRef.current = true;
  }, []);

  /**
   * Legacy speak: pass full text at once (splits into chunks internally).
   */
  const speak = useCallback(
    (text: string) => {
      stop();

      if (speakerIdRef.current === null) {
        setError("キャラクターが選択されていません");
        return;
      }

      const chunks = splitTextIntoChunks(text, CHUNK_MAX_LENGTH);
      speakIdRef.current += 1;
      const currentId = speakIdRef.current;

      setIsSpeaking(true);
      setError(null);

      // Put all chunks into queue and start processing
      queueRef.current = chunks;
      streamFinishedRef.current = true; // All chunks are already known
      isProcessingRef.current = false;

      // Pre-fetch first chunk immediately
      if (chunks.length > 0) {
        prefetchedIndexRef.current = 0;
        prefetchedBufferRef.current = synthesizeChunk(chunks[0]);
      }

      processQueue(currentId);
    },
    [stop, processQueue, synthesizeChunk]
  );

  useEffect(() => {
    return () => {
      speakIdRef.current += 1;
      cleanupAudio();
    };
  }, [cleanupAudio]);

  return { speak, enqueue, finishStream, stop, isSpeaking, error };
}
