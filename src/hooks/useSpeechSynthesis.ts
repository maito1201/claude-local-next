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

  onEndRef.current = onEnd;
  volumeRef.current = volume;
  rateRef.current = rate;
  voiceURIRef.current = voiceURI;

  useEffect(() => {
    setIsSupported(isSpeechSynthesisSupported());
  }, []);

  const stop = useCallback(() => {
    speakIdRef.current += 1;
    setIsSpeaking(false);
    if (isSpeechSynthesisSupported()) {
      window.speechSynthesis.cancel();
    }
  }, []);

  const speak = useCallback(
    (text: string) => {
      if (!isSpeechSynthesisSupported()) return;

      stop();

      const chunks = splitTextIntoChunks(text, CHUNK_MAX_LENGTH);
      speakIdRef.current += 1;
      const currentId = speakIdRef.current;

      setIsSpeaking(true);

      function speakChunk(index: number) {
        if (currentId !== speakIdRef.current) return;
        if (index >= chunks.length) {
          setIsSpeaking(false);
          onEndRef.current();
          return;
        }

        const utterance = new SpeechSynthesisUtterance(chunks[index]);
        utterance.lang = navigator.language;
        utterance.volume = volumeRef.current;
        utterance.rate = rateRef.current;

        if (voiceURIRef.current) {
          const voices = window.speechSynthesis.getVoices();
          const voice = voices.find(
            (v) => v.voiceURI === voiceURIRef.current
          );
          if (voice) {
            utterance.voice = voice;
          }
        }

        utterance.onend = () => {
          speakChunk(index + 1);
        };

        utterance.onerror = (event) => {
          // "canceled" は stop() による正常なキャンセル
          if (event.error === "canceled") return;
          setIsSpeaking(false);
          onEndRef.current();
        };

        window.speechSynthesis.speak(utterance);
      }

      speakChunk(0);
    },
    [stop]
  );

  useEffect(() => {
    return () => {
      speakIdRef.current += 1;
      if (isSpeechSynthesisSupported()) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  return { speak, stop, isSpeaking, isSupported };
}
