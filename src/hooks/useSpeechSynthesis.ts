import { useState, useRef, useEffect, useCallback } from "react";
import { splitTextIntoChunks, CHUNK_MAX_LENGTH } from "@/lib/split-text";

interface UseSpeechSynthesisOptions {
  onEnd: () => void;
  volume: number;
  rate: number;
  voiceURI: string | null;
}

interface UseSpeechSynthesisReturn {
  speak: (text: string) => void;
  enqueue: (text: string) => void;
  finishStream: () => void;
  stop: () => void;
  isSpeaking: boolean;
  isSupported: boolean;
}

export function isSpeechSynthesisSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "speechSynthesis" in window &&
    "SpeechSynthesisUtterance" in window
  );
}

export function useSpeechSynthesis({
  onEnd,
  volume,
  rate,
  voiceURI,
}: UseSpeechSynthesisOptions): UseSpeechSynthesisReturn {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isSupported, setIsSupported] = useState(false);

  const onEndRef = useRef(onEnd);
  const speakIdRef = useRef(0);
  const volumeRef = useRef(volume);
  const rateRef = useRef(rate);
  const voiceURIRef = useRef(voiceURI);

  // Queue state for streaming TTS
  const queueRef = useRef<string[]>([]);
  const queueIndexRef = useRef(0);
  const isProcessingRef = useRef(false);
  const streamFinishedRef = useRef(false);

  onEndRef.current = onEnd;
  volumeRef.current = volume;
  rateRef.current = rate;
  voiceURIRef.current = voiceURI;

  useEffect(() => {
    setIsSupported(isSpeechSynthesisSupported());
  }, []);

  const resetQueue = useCallback(() => {
    queueRef.current = [];
    queueIndexRef.current = 0;
    isProcessingRef.current = false;
    streamFinishedRef.current = false;
  }, []);

  const stop = useCallback(() => {
    speakIdRef.current += 1;
    setIsSpeaking(false);
    resetQueue();
    if (isSpeechSynthesisSupported()) {
      window.speechSynthesis.cancel();
    }
  }, [resetQueue]);

  /**
   * Speak a single chunk and call onDone when finished.
   */
  const speakSingleChunk = useCallback(
    (text: string, currentId: number, onDone: () => void) => {
      if (currentId !== speakIdRef.current) return;

      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = navigator.language;
      utterance.volume = volumeRef.current;
      utterance.rate = rateRef.current;

      if (voiceURIRef.current) {
        const voices = window.speechSynthesis.getVoices();
        const voice = voices.find((v) => v.voiceURI === voiceURIRef.current);
        if (voice) {
          utterance.voice = voice;
        }
      }

      utterance.onend = () => {
        onDone();
      };

      utterance.onerror = (event) => {
        if (event.error === "canceled") return;
        setIsSpeaking(false);
        isProcessingRef.current = false;
        onEndRef.current();
      };

      window.speechSynthesis.speak(utterance);
    },
    []
  );

  /**
   * Process the queue: play chunks sequentially.
   */
  const processQueue = useCallback(
    (currentId: number) => {
      if (isProcessingRef.current) return;
      isProcessingRef.current = true;

      function processNext() {
        if (currentId !== speakIdRef.current) return;

        if (queueIndexRef.current >= queueRef.current.length) {
          if (streamFinishedRef.current) {
            // All done
            setIsSpeaking(false);
            isProcessingRef.current = false;
            onEndRef.current();
            return;
          }
          // Wait for more chunks
          isProcessingRef.current = false;
          return;
        }

        const chunk = queueRef.current[queueIndexRef.current];
        queueIndexRef.current++;

        speakSingleChunk(chunk, currentId, processNext);
      }

      processNext();
    },
    [speakSingleChunk]
  );

  /**
   * Enqueue a text segment for streaming TTS.
   */
  const enqueue = useCallback(
    (text: string) => {
      if (!isSpeechSynthesisSupported()) return;

      const subChunks = splitTextIntoChunks(text, CHUNK_MAX_LENGTH);
      const wasEmpty = queueRef.current.length === 0;
      queueRef.current.push(...subChunks);

      if (!isProcessingRef.current) {
        if (wasEmpty) {
          speakIdRef.current += 1;
          streamFinishedRef.current = false;
          setIsSpeaking(true);
        }
        const currentId = speakIdRef.current;
        processQueue(currentId);
      }
    },
    [processQueue]
  );

  /**
   * Signal that no more text will be enqueued.
   */
  const finishStream = useCallback(() => {
    streamFinishedRef.current = true;
    // If processing already finished waiting, restart it
    if (!isProcessingRef.current && queueRef.current.length > 0) {
      processQueue(speakIdRef.current);
    }
    // If queue is empty and processing stopped, trigger onEnd
    if (
      !isProcessingRef.current &&
      queueIndexRef.current >= queueRef.current.length
    ) {
      setIsSpeaking(false);
      onEndRef.current();
    }
  }, [processQueue]);

  const speak = useCallback(
    (text: string) => {
      if (!isSpeechSynthesisSupported()) return;

      stop();

      const chunks = splitTextIntoChunks(text, CHUNK_MAX_LENGTH);
      speakIdRef.current += 1;
      const currentId = speakIdRef.current;

      setIsSpeaking(true);

      queueRef.current = chunks;
      queueIndexRef.current = 0;
      streamFinishedRef.current = true;
      isProcessingRef.current = false;

      processQueue(currentId);
    },
    [stop, processQueue]
  );

  useEffect(() => {
    return () => {
      speakIdRef.current += 1;
      if (isSpeechSynthesisSupported()) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  return { speak, enqueue, finishStream, stop, isSpeaking, isSupported };
}
