import { useState, useRef, useEffect, useCallback } from "react";
import { useTtsSettings } from "./useTtsSettings";
import {
  useSpeechSynthesis,
  isSpeechSynthesisSupported,
} from "./useSpeechSynthesis";
import { useVoicevox } from "./useVoicevox";
import {
  fetchSpeakers,
  findDefaultSpeakerId,
  VoicevoxConnectionError,
  type VoicevoxSpeaker,
} from "@/lib/voicevox-client";
import {
  TTS_ENGINE_BROWSER,
  TTS_ENGINE_VOICEVOX,
  type TtsSettings,
} from "@/types/tts-settings";

interface UseTtsOptions {
  onEnd: () => void;
}

interface UseTtsReturn {
  speak: (text: string) => void;
  enqueue: (text: string) => void;
  finishStream: () => void;
  stop: () => void;
  isSpeaking: boolean;
  isSupported: boolean;
  settings: TtsSettings;
  updateSettings: (updater: (prev: TtsSettings) => TtsSettings) => void;
  speakers: VoicevoxSpeaker[];
  browserVoices: SpeechSynthesisVoice[];
  speakerLoadError: string | null;
  speakError: string | null;
  refetchSpeakers: () => void;
}

export function useTts({ onEnd }: UseTtsOptions): UseTtsReturn {
  const { settings, updateSettings } = useTtsSettings();

  const [speakers, setSpeakers] = useState<VoicevoxSpeaker[]>([]);
  const [speakerLoadError, setSpeakerLoadError] = useState<string | null>(
    null
  );
  const [browserVoices, setBrowserVoices] = useState<SpeechSynthesisVoice[]>(
    []
  );
  const [isSupported, setIsSupported] = useState(false);

  const browserTts = useSpeechSynthesis({
    onEnd,
    volume: settings.volume,
    rate: settings.browser.rate,
    voiceURI: settings.browser.voiceURI,
  });

  const voicevox = useVoicevox({
    onEnd,
    speakerId: settings.voicevox.speakerId,
    speedScale: settings.voicevox.speedScale,
    volume: settings.volume,
  });

  const engines = useRef({
    [TTS_ENGINE_BROWSER]: browserTts,
    [TTS_ENGINE_VOICEVOX]: voicevox,
  });
  engines.current[TTS_ENGINE_BROWSER] = browserTts;
  engines.current[TTS_ENGINE_VOICEVOX] = voicevox;

  const engineRef = useRef(settings.engine);
  engineRef.current = settings.engine;

  // エンジン切り替え時に再生中の音声を停止する
  useEffect(() => {
    browserTts.stop();
    voicevox.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.engine]);

  useEffect(() => {
    setIsSupported(true);
  }, []);

  const loadSpeakers = useCallback(async () => {
    try {
      setSpeakerLoadError(null);
      const data = await fetchSpeakers();
      setSpeakers(data);
    } catch (err) {
      setSpeakerLoadError(
        err instanceof VoicevoxConnectionError
          ? err.message
          : `スピーカー一覧の取得に失敗しました: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }, []);

  useEffect(() => {
    loadSpeakers();
  }, [loadSpeakers]);

  useEffect(() => {
    if (settings.voicevox.speakerId !== null) return;
    if (speakers.length === 0) return;

    const defaultId = findDefaultSpeakerId(speakers);
    if (defaultId === null) return;

    updateSettings((prev) => ({
      ...prev,
      voicevox: { ...prev.voicevox, speakerId: defaultId },
    }));
  }, [speakers, settings.voicevox.speakerId, updateSettings]);

  useEffect(() => {
    if (!isSpeechSynthesisSupported()) return;

    const loadVoices = () => {
      setBrowserVoices(window.speechSynthesis.getVoices());
    };

    loadVoices();
    window.speechSynthesis.addEventListener("voiceschanged", loadVoices);
    return () => {
      window.speechSynthesis.removeEventListener("voiceschanged", loadVoices);
    };
  }, []);

  const speak = useCallback(
    (text: string) => {
      engines.current[engineRef.current].speak(text);
    },
    []
  );

  const enqueue = useCallback(
    (text: string) => {
      engines.current[engineRef.current].enqueue(text);
    },
    []
  );

  const finishStream = useCallback(() => {
    engines.current[engineRef.current].finishStream();
  }, []);

  const stop = useCallback(() => {
    browserTts.stop();
    voicevox.stop();
  }, [browserTts.stop, voicevox.stop]);

  const isSpeaking = browserTts.isSpeaking || voicevox.isSpeaking;

  return {
    speak,
    enqueue,
    finishStream,
    stop,
    isSpeaking,
    isSupported,
    settings,
    updateSettings,
    speakers,
    browserVoices,
    speakerLoadError,
    speakError: voicevox.error,
    refetchSpeakers: loadSpeakers,
  };
}
