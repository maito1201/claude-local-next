import { renderHook, act, waitFor } from "@testing-library/react";
import { useTts } from "../useTts";
import { TTS_ENGINE_BROWSER, TTS_ENGINE_VOICEVOX } from "@/types/tts-settings";

const mockBrowserSpeak = jest.fn();
const mockBrowserStop = jest.fn();
let mockBrowserIsSpeaking = false;

jest.mock("../useSpeechSynthesis", () => ({
  useSpeechSynthesis: () => ({
    speak: mockBrowserSpeak,
    stop: mockBrowserStop,
    isSpeaking: mockBrowserIsSpeaking,
    isSupported: true,
  }),
  isSpeechSynthesisSupported: () => true,
}));

const mockVoicevoxSpeak = jest.fn();
const mockVoicevoxStop = jest.fn();
let mockVoicevoxIsSpeaking = false;
let mockVoicevoxError: string | null = null;

jest.mock("../useVoicevox", () => ({
  useVoicevox: () => ({
    speak: mockVoicevoxSpeak,
    stop: mockVoicevoxStop,
    isSpeaking: mockVoicevoxIsSpeaking,
    error: mockVoicevoxError,
  }),
}));

const mockFetchSpeakers = jest.fn();
const mockFindDefaultSpeakerId = jest.fn();

jest.mock("@/lib/voicevox-client", () => ({
  fetchSpeakers: (...args: unknown[]) => mockFetchSpeakers(...args),
  findDefaultSpeakerId: (...args: unknown[]) =>
    mockFindDefaultSpeakerId(...args),
  VoicevoxConnectionError: class VoicevoxConnectionError extends Error {
    constructor() {
      super("VOICEVOXエンジンに接続できません。");
      this.name = "VoicevoxConnectionError";
    }
  },
}));

beforeEach(() => {
  jest.clearAllMocks();
  mockBrowserIsSpeaking = false;
  mockVoicevoxIsSpeaking = false;
  mockVoicevoxError = null;
  mockFetchSpeakers.mockResolvedValue([]);
  mockFindDefaultSpeakerId.mockReturnValue(null);
  localStorage.clear();

  // Mock speechSynthesis for browserVoices loading
  if (!("speechSynthesis" in window)) {
    Object.defineProperty(window, "speechSynthesis", {
      value: {
        getVoices: jest.fn(() => []),
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
      },
      writable: true,
      configurable: true,
    });
  }

  if (!("SpeechSynthesisUtterance" in window)) {
    (window as unknown as Record<string, unknown>).SpeechSynthesisUtterance =
      jest.fn();
  }
});

afterEach(() => {
  delete (window as unknown as Record<string, unknown>).speechSynthesis;
  delete (window as unknown as Record<string, unknown>).SpeechSynthesisUtterance;
});

describe("useTts", () => {
  test("should call browser speak when engine is browser", () => {
    const onEnd = jest.fn();
    const { result } = renderHook(() => useTts({ onEnd }));

    act(() => {
      result.current.speak("テスト");
    });

    expect(mockBrowserSpeak).toHaveBeenCalledWith("テスト");
    expect(mockVoicevoxSpeak).not.toHaveBeenCalled();
  });

  test("should call voicevox speak when engine is voicevox", () => {
    const onEnd = jest.fn();
    const { result } = renderHook(() => useTts({ onEnd }));

    act(() => {
      result.current.updateSettings((prev) => ({
        ...prev,
        engine: TTS_ENGINE_VOICEVOX,
      }));
    });

    act(() => {
      result.current.speak("テスト");
    });

    expect(mockVoicevoxSpeak).toHaveBeenCalledWith("テスト");
    expect(mockBrowserSpeak).not.toHaveBeenCalled();
  });

  test("should stop both engines when stop is called", () => {
    const onEnd = jest.fn();
    const { result } = renderHook(() => useTts({ onEnd }));

    act(() => {
      result.current.stop();
    });

    expect(mockBrowserStop).toHaveBeenCalled();
    expect(mockVoicevoxStop).toHaveBeenCalled();
  });

  test("should return isSupported as true", () => {
    const onEnd = jest.fn();
    const { result } = renderHook(() => useTts({ onEnd }));

    expect(result.current.isSupported).toBe(true);
  });

  test("should fetch speakers on mount", async () => {
    const speakers = [
      { name: "ずんだもん", speaker_uuid: "uuid", styles: [{ name: "ノーマル", id: 3 }] },
    ];
    mockFetchSpeakers.mockResolvedValue(speakers);

    const onEnd = jest.fn();
    const { result } = renderHook(() => useTts({ onEnd }));

    await waitFor(() => {
      expect(result.current.speakers).toEqual(speakers);
    });
  });

  test("should set speakerLoadError when fetch fails", async () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { VoicevoxConnectionError } = require("@/lib/voicevox-client");
    mockFetchSpeakers.mockRejectedValue(new VoicevoxConnectionError());

    const onEnd = jest.fn();
    const { result } = renderHook(() => useTts({ onEnd }));

    await waitFor(() => {
      expect(result.current.speakerLoadError).toContain(
        "VOICEVOXエンジンに接続できません"
      );
    });
  });

  test("should auto-select ずんだもん when speakers load and no speaker selected", async () => {
    const speakers = [
      { name: "ずんだもん", speaker_uuid: "uuid", styles: [{ name: "ノーマル", id: 3 }] },
    ];
    mockFetchSpeakers.mockResolvedValue(speakers);
    mockFindDefaultSpeakerId.mockReturnValue(3);

    const onEnd = jest.fn();
    const { result } = renderHook(() => useTts({ onEnd }));

    await waitFor(() => {
      expect(result.current.settings.voicevox.speakerId).toBe(3);
    });
  });

  test("should update settings via updateSettings", () => {
    const onEnd = jest.fn();
    const { result } = renderHook(() => useTts({ onEnd }));

    act(() => {
      result.current.updateSettings((prev) => ({
        ...prev,
        volume: 0.5,
      }));
    });

    expect(result.current.settings.volume).toBe(0.5);
  });

  test("should default to browser engine", () => {
    const onEnd = jest.fn();
    const { result } = renderHook(() => useTts({ onEnd }));

    expect(result.current.settings.engine).toBe(TTS_ENGINE_BROWSER);
  });
});
