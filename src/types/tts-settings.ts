export const TTS_ENGINE_BROWSER = "browser" as const;
export const TTS_ENGINE_VOICEVOX = "voicevox" as const;

export type TtsEngine = typeof TTS_ENGINE_BROWSER | typeof TTS_ENGINE_VOICEVOX;

export const TTS_SETTINGS_STORAGE_KEY = "tts-settings";

export const VOICEVOX_DEFAULT_SPEAKER_NAME = "ずんだもん";

export interface BrowserTtsSettings {
  rate: number;
  voiceURI: string | null;
}

export interface VoicevoxSettings {
  speakerId: number | null;
  speedScale: number;
}

export interface TtsSettings {
  engine: TtsEngine;
  volume: number;
  browser: BrowserTtsSettings;
  voicevox: VoicevoxSettings;
}

export const DEFAULT_TTS_SETTINGS: TtsSettings = {
  engine: TTS_ENGINE_BROWSER,
  volume: 1.0,
  browser: {
    rate: 1.0,
    voiceURI: null,
  },
  voicevox: {
    speakerId: null,
    speedScale: 1.0,
  },
};
