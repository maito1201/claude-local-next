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

  const stop = useCallback(() => {
    speakIdRef.current += 1;
    setIsSpeaking(false);
    cleanupAudio();
  }, [cleanupAudio]);

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

      async function speakChunk(index: number) {
        if (currentId !== speakIdRef.current) return;
        if (index >= chunks.length) {
          setIsSpeaking(false);
          onEndRef.current();
          return;
        }

        try {
          const buffer = await synthesize(
            chunks[index],
            speakerIdRef.current!,
            speedScaleRef.current,
            volumeRef.current
          );

          if (currentId !== speakIdRef.current) return;

          const blob = new Blob([buffer], { type: "audio/wav" });
          const url = URL.createObjectURL(blob);
          objectUrlRef.current = url;

          const audio = new Audio(url);
          audioRef.current = audio;

          audio.onended = () => {
            URL.revokeObjectURL(url);
            objectUrlRef.current = null;
            audioRef.current = null;
            speakChunk(index + 1);
          };

          audio.onerror = () => {
            URL.revokeObjectURL(url);
            objectUrlRef.current = null;
            audioRef.current = null;
            setIsSpeaking(false);
            setError("音声の再生に失敗しました");
            onEndRef.current();
          };

          await audio.play();
        } catch (err) {
          if (currentId !== speakIdRef.current) return;
          setIsSpeaking(false);
          setError(
            err instanceof VoicevoxConnectionError
              ? err.message
              : `音声合成に失敗しました: ${err instanceof Error ? err.message : String(err)}`
          );
          onEndRef.current();
        }
      }

      speakChunk(0);
    },
    [stop]
  );

  useEffect(() => {
    return () => {
      speakIdRef.current += 1;
      cleanupAudio();
    };
  }, [cleanupAudio]);

  return { speak, stop, isSpeaking, error };
}
