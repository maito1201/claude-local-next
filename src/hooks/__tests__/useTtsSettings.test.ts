import { renderHook, act } from "@testing-library/react";
import { useTtsSettings } from "../useTtsSettings";
import {
  TTS_SETTINGS_STORAGE_KEY,
  DEFAULT_TTS_SETTINGS,
  TTS_ENGINE_VOICEVOX,
  type TtsSettings,
} from "@/types/tts-settings";

beforeEach(() => {
  localStorage.clear();
});

describe("useTtsSettings", () => {
  test("should return default settings when localStorage is empty", () => {
    const { result } = renderHook(() => useTtsSettings());

    expect(result.current.settings).toEqual(DEFAULT_TTS_SETTINGS);
  });

  test("should load settings from localStorage", () => {
    const stored: TtsSettings = {
      ...DEFAULT_TTS_SETTINGS,
      engine: TTS_ENGINE_VOICEVOX,
      volume: 0.5,
    };
    localStorage.setItem(TTS_SETTINGS_STORAGE_KEY, JSON.stringify(stored));

    const { result } = renderHook(() => useTtsSettings());

    expect(result.current.settings.engine).toBe(TTS_ENGINE_VOICEVOX);
    expect(result.current.settings.volume).toBe(0.5);
  });

  test("should return default settings when localStorage contains invalid JSON", () => {
    localStorage.setItem(TTS_SETTINGS_STORAGE_KEY, "not-json");

    const { result } = renderHook(() => useTtsSettings());

    expect(result.current.settings).toEqual(DEFAULT_TTS_SETTINGS);
  });

  test("should update settings and persist to localStorage", () => {
    const { result } = renderHook(() => useTtsSettings());

    act(() => {
      result.current.updateSettings((prev) => ({
        ...prev,
        volume: 0.7,
      }));
    });

    expect(result.current.settings.volume).toBe(0.7);

    const stored = JSON.parse(
      localStorage.getItem(TTS_SETTINGS_STORAGE_KEY)!
    );
    expect(stored.volume).toBe(0.7);
  });

  test("should update nested browser settings", () => {
    const { result } = renderHook(() => useTtsSettings());

    act(() => {
      result.current.updateSettings((prev) => ({
        ...prev,
        browser: { ...prev.browser, rate: 1.5 },
      }));
    });

    expect(result.current.settings.browser.rate).toBe(1.5);
  });

  test("should update nested voicevox settings", () => {
    const { result } = renderHook(() => useTtsSettings());

    act(() => {
      result.current.updateSettings((prev) => ({
        ...prev,
        voicevox: { ...prev.voicevox, speakerId: 3 },
      }));
    });

    expect(result.current.settings.voicevox.speakerId).toBe(3);
  });
});
