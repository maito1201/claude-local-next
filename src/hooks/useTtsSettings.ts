import { useState, useCallback } from "react";
import {
  TTS_SETTINGS_STORAGE_KEY,
  DEFAULT_TTS_SETTINGS,
  type TtsSettings,
} from "@/types/tts-settings";

interface UseTtsSettingsReturn {
  settings: TtsSettings;
  updateSettings: (updater: (prev: TtsSettings) => TtsSettings) => void;
}

function loadSettings(): TtsSettings {
  if (typeof window === "undefined") return DEFAULT_TTS_SETTINGS;

  const stored = localStorage.getItem(TTS_SETTINGS_STORAGE_KEY);
  if (!stored) return DEFAULT_TTS_SETTINGS;

  try {
    const parsed = JSON.parse(stored);
    return {
      ...DEFAULT_TTS_SETTINGS,
      ...parsed,
      browser: { ...DEFAULT_TTS_SETTINGS.browser, ...parsed.browser },
      voicevox: { ...DEFAULT_TTS_SETTINGS.voicevox, ...parsed.voicevox },
    };
  } catch {
    return DEFAULT_TTS_SETTINGS;
  }
}

export function useTtsSettings(): UseTtsSettingsReturn {
  const [settings, setSettings] = useState<TtsSettings>(loadSettings);

  const updateSettings = useCallback(
    (updater: (prev: TtsSettings) => TtsSettings) => {
      setSettings((prev) => {
        const next = updater(prev);
        localStorage.setItem(TTS_SETTINGS_STORAGE_KEY, JSON.stringify(next));
        return next;
      });
    },
    []
  );

  return { settings, updateSettings };
}
