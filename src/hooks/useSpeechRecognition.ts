import { useState, useRef, useEffect, useCallback } from "react";

const SILENCE_TIMEOUT_MS = 1000;

interface UseSpeechRecognitionOptions {
  onResult: (text: string) => void;
}

interface UseSpeechRecognitionReturn {
  start: () => void;
  stop: () => void;
  isListening: boolean;
  isSupported: boolean;
  transcript: string;
  error: string;
}

function isSpeechRecognitionSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    ("SpeechRecognition" in window || "webkitSpeechRecognition" in window)
  );
}

function createSpeechRecognition(): SpeechRecognition {
  const SpeechRecognitionCtor =
    window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognitionCtor) {
    throw new Error("SpeechRecognition is not supported");
  }
  const recognition = new SpeechRecognitionCtor();
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.lang = navigator.language;
  return recognition;
}

export function useSpeechRecognition({
  onResult,
}: UseSpeechRecognitionOptions): UseSpeechRecognitionReturn {
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [error, setError] = useState("");
  const [isSupported, setIsSupported] = useState(false);

  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const onResultRef = useRef(onResult);
  const isListeningRef = useRef(false);
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const restartTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const finalBufferRef = useRef("");

  onResultRef.current = onResult;

  useEffect(() => {
    setIsSupported(isSpeechRecognitionSupported());
  }, []);

  useEffect(() => {
    if (!isSupported) return;

    const recognition = createSpeechRecognition();
    recognitionRef.current = recognition;

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let interim = "";

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) {
          finalBufferRef.current += result[0].transcript;
        } else {
          interim += result[0].transcript;
        }
      }

      setTranscript(finalBufferRef.current + interim);

      if (silenceTimerRef.current !== null) {
        clearTimeout(silenceTimerRef.current);
      }

      silenceTimerRef.current = setTimeout(() => {
        if (finalBufferRef.current) {
          onResultRef.current(finalBufferRef.current);
          finalBufferRef.current = "";
          setTranscript("");
        }
        silenceTimerRef.current = null;
      }, SILENCE_TIMEOUT_MS);
    };

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      isListeningRef.current = false;
      setIsListening(false);
      if (silenceTimerRef.current !== null) {
        clearTimeout(silenceTimerRef.current);
        silenceTimerRef.current = null;
      }
      finalBufferRef.current = "";
      setTranscript("");
      setError(event.error);
    };

    // Chrome stops recognition even with continuous=true on timeout
    recognition.onend = () => {
      if (isListeningRef.current) {
        const restart = (attempt = 0) => {
          if (!isListeningRef.current) return;
          try {
            recognition.start();
          } catch {
            if (attempt < 5) {
              restartTimerRef.current = setTimeout(() => restart(attempt + 1), 200 * (attempt + 1));
            } else {
              isListeningRef.current = false;
              setIsListening(false);
              setError("restart-failed");
            }
          }
        };
        restartTimerRef.current = setTimeout(restart, 300);
      }
    };

    return () => {
      if (silenceTimerRef.current !== null) {
        clearTimeout(silenceTimerRef.current);
      }
      if (restartTimerRef.current !== null) {
        clearTimeout(restartTimerRef.current);
      }
      recognition.stop();
    };
  }, [isSupported]);

  const start = useCallback(() => {
    if (!recognitionRef.current) return;
    isListeningRef.current = true;
    setIsListening(true);
    setError("");
    recognitionRef.current.start();
  }, []);

  const stop = useCallback(() => {
    if (!recognitionRef.current) return;
    isListeningRef.current = false;
    setIsListening(false);
    if (silenceTimerRef.current !== null) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
    finalBufferRef.current = "";
    setTranscript("");
    recognitionRef.current.stop();
  }, []);

  return { start, stop, isListening, isSupported, transcript, error };
}
