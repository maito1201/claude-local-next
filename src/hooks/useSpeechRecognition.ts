import { useState, useRef, useEffect, useCallback } from "react";

const SILENCE_TIMEOUT_MS = 1000;
const POLL_INTERVAL_MS = 3000;

interface UseSpeechRecognitionOptions {
  onResult: (text: string) => void;
}

interface UseSpeechRecognitionReturn {
  enableVoiceMode: () => void;
  disableVoiceMode: () => void;
  suspend: () => void;
  resume: () => void;
  voiceMode: boolean;
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
  const [voiceMode, setVoiceMode] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [error, setError] = useState("");
  const [isSupported, setIsSupported] = useState(false);

  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const onResultRef = useRef(onResult);
  const voiceModeRef = useRef(false);
  const isListeningRef = useRef(false);
  const suspendedRef = useRef(false);
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
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

    recognition.onend = () => {
      isListeningRef.current = false;
      setIsListening(false);
    };

    return () => {
      if (silenceTimerRef.current !== null) {
        clearTimeout(silenceTimerRef.current);
      }
      recognition.stop();
    };
  }, [isSupported]);

  // Polling: while voiceMode is ON and not suspended, restart recognition if it stopped
  useEffect(() => {
    if (!voiceMode) return;

    const id = setInterval(() => {
      if (
        voiceModeRef.current &&
        !suspendedRef.current &&
        !isListeningRef.current &&
        recognitionRef.current
      ) {
        try {
          recognitionRef.current.start();
          isListeningRef.current = true;
          setIsListening(true);
          setError("");
        } catch {
          // Will retry on next poll interval
        }
      }
    }, POLL_INTERVAL_MS);

    return () => clearInterval(id);
  }, [voiceMode]);

  const startRecognition = useCallback(() => {
    if (!recognitionRef.current) return;
    try {
      recognitionRef.current.start();
      isListeningRef.current = true;
      setIsListening(true);
      setError("");
    } catch {
      // Polling will retry
    }
  }, []);

  const stopRecognition = useCallback(() => {
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

  const enableVoiceMode = useCallback(() => {
    voiceModeRef.current = true;
    suspendedRef.current = false;
    setVoiceMode(true);
    startRecognition();
  }, [startRecognition]);

  const disableVoiceMode = useCallback(() => {
    voiceModeRef.current = false;
    suspendedRef.current = false;
    setVoiceMode(false);
    stopRecognition();
  }, [stopRecognition]);

  const suspend = useCallback(() => {
    suspendedRef.current = true;
    stopRecognition();
  }, [stopRecognition]);

  const resume = useCallback(() => {
    suspendedRef.current = false;
    if (voiceModeRef.current) {
      startRecognition();
    }
  }, [startRecognition]);

  return {
    enableVoiceMode,
    disableVoiceMode,
    suspend,
    resume,
    voiceMode,
    isListening,
    isSupported,
    transcript,
    error,
  };
}
