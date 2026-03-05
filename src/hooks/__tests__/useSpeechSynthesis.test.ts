import { renderHook, act } from "@testing-library/react";
import { useSpeechSynthesis } from "../useSpeechSynthesis";

interface MockUtterance {
  text: string;
  lang: string;
  volume: number;
  rate: number;
  voice: { voiceURI: string } | null;
  onend: (() => void) | null;
  onerror: ((event: { error: string }) => void) | null;
}

const DEFAULT_OPTIONS = {
  onEnd: jest.fn(),
  volume: 1.0,
  rate: 1.0,
  voiceURI: null as string | null,
};

let mockUtterances: MockUtterance[];
let mockSpeechSynthesis: {
  speak: jest.Mock;
  cancel: jest.Mock;
  getVoices: jest.Mock;
};

beforeEach(() => {
  mockUtterances = [];
  mockSpeechSynthesis = {
    speak: jest.fn((utterance: MockUtterance) => {
      mockUtterances.push(utterance);
    }),
    cancel: jest.fn(),
    getVoices: jest.fn(() => [
      { voiceURI: "voice-1", name: "Voice 1", lang: "ja-JP" },
      { voiceURI: "voice-2", name: "Voice 2", lang: "en-US" },
    ]),
  };

  Object.defineProperty(window, "speechSynthesis", {
    value: mockSpeechSynthesis,
    writable: true,
    configurable: true,
  });

  (window as unknown as Record<string, unknown>).SpeechSynthesisUtterance =
    jest.fn((text: string) => {
      const utterance: MockUtterance = {
        text,
        lang: "",
        volume: 1.0,
        rate: 1.0,
        voice: null,
        onend: null,
        onerror: null,
      };
      return utterance;
    });
});

afterEach(() => {
  delete (window as unknown as Record<string, unknown>)
    .SpeechSynthesisUtterance;
  delete (window as unknown as Record<string, unknown>).speechSynthesis;
});

describe("useSpeechSynthesis", () => {
  test("should report isSupported as true when SpeechSynthesis is available", () => {
    const onEnd = jest.fn();
    const { result } = renderHook(() =>
      useSpeechSynthesis({ ...DEFAULT_OPTIONS, onEnd })
    );

    expect(result.current.isSupported).toBe(true);
  });

  test("should report isSupported as false when SpeechSynthesis is unavailable", () => {
    delete (window as unknown as Record<string, unknown>)
      .SpeechSynthesisUtterance;
    delete (window as unknown as Record<string, unknown>).speechSynthesis;

    const onEnd = jest.fn();
    const { result } = renderHook(() =>
      useSpeechSynthesis({ ...DEFAULT_OPTIONS, onEnd })
    );

    expect(result.current.isSupported).toBe(false);
  });

  test("should set isSpeaking to true when speak is called", () => {
    const onEnd = jest.fn();
    const { result } = renderHook(() =>
      useSpeechSynthesis({ ...DEFAULT_OPTIONS, onEnd })
    );

    act(() => {
      result.current.speak("Hello");
    });

    expect(result.current.isSpeaking).toBe(true);
    expect(mockSpeechSynthesis.speak).toHaveBeenCalledTimes(1);
  });

  test("should set isSpeaking to false and call onEnd when utterance completes", () => {
    const onEnd = jest.fn();
    const { result } = renderHook(() =>
      useSpeechSynthesis({ ...DEFAULT_OPTIONS, onEnd })
    );

    act(() => {
      result.current.speak("Hello");
    });

    act(() => {
      mockUtterances[0].onend!();
    });

    expect(result.current.isSpeaking).toBe(false);
    expect(onEnd).toHaveBeenCalledTimes(1);
  });

  test("should cancel speech and set isSpeaking to false when stop is called", () => {
    const onEnd = jest.fn();
    const { result } = renderHook(() =>
      useSpeechSynthesis({ ...DEFAULT_OPTIONS, onEnd })
    );

    act(() => {
      result.current.speak("Hello");
    });

    act(() => {
      result.current.stop();
    });

    expect(mockSpeechSynthesis.cancel).toHaveBeenCalled();
    expect(result.current.isSpeaking).toBe(false);
    expect(onEnd).not.toHaveBeenCalled();
  });

  test("should split long text into chunks and play sequentially", () => {
    const onEnd = jest.fn();
    const { result } = renderHook(() =>
      useSpeechSynthesis({ ...DEFAULT_OPTIONS, onEnd })
    );

    const longText = "あ".repeat(300);

    act(() => {
      result.current.speak(longText);
    });

    expect(mockSpeechSynthesis.speak).toHaveBeenCalledTimes(1);
    expect(mockUtterances[0].text.length).toBeLessThanOrEqual(200);

    act(() => {
      mockUtterances[0].onend!();
    });

    expect(mockSpeechSynthesis.speak).toHaveBeenCalledTimes(2);

    act(() => {
      mockUtterances[1].onend!();
    });

    expect(result.current.isSpeaking).toBe(false);
    expect(onEnd).toHaveBeenCalledTimes(1);
  });

  test("should split text at sentence boundaries", () => {
    const onEnd = jest.fn();
    const { result } = renderHook(() =>
      useSpeechSynthesis({ ...DEFAULT_OPTIONS, onEnd })
    );

    const text = "あ".repeat(100) + "。" + "い".repeat(150);

    act(() => {
      result.current.speak(text);
    });

    expect(mockUtterances[0].text).toBe("あ".repeat(100) + "。");
  });

  test("should split text at clause boundaries when no sentence boundary", () => {
    const onEnd = jest.fn();
    const { result } = renderHook(() =>
      useSpeechSynthesis({ ...DEFAULT_OPTIONS, onEnd })
    );

    const text = "あ".repeat(100) + "、" + "い".repeat(150);

    act(() => {
      result.current.speak(text);
    });

    expect(mockUtterances[0].text).toBe("あ".repeat(100) + "、");
  });

  test("should not call stale callbacks after stop", () => {
    const onEnd = jest.fn();
    const { result } = renderHook(() =>
      useSpeechSynthesis({ ...DEFAULT_OPTIONS, onEnd })
    );

    act(() => {
      result.current.speak("Hello");
    });

    const firstUtterance = mockUtterances[0];

    act(() => {
      result.current.stop();
    });

    act(() => {
      firstUtterance.onend!();
    });

    expect(onEnd).not.toHaveBeenCalled();
  });

  test("should set isSpeaking to false and call onEnd on utterance error", () => {
    const onEnd = jest.fn();
    const { result } = renderHook(() =>
      useSpeechSynthesis({ ...DEFAULT_OPTIONS, onEnd })
    );

    act(() => {
      result.current.speak("Hello");
    });

    act(() => {
      mockUtterances[0].onerror!({ error: "synthesis-failed" });
    });

    expect(result.current.isSpeaking).toBe(false);
    expect(onEnd).toHaveBeenCalledTimes(1);
  });

  test("should ignore canceled error from stop", () => {
    const onEnd = jest.fn();
    const { result } = renderHook(() =>
      useSpeechSynthesis({ ...DEFAULT_OPTIONS, onEnd })
    );

    act(() => {
      result.current.speak("Hello");
    });

    act(() => {
      mockUtterances[0].onerror!({ error: "canceled" });
    });

    expect(onEnd).not.toHaveBeenCalled();
  });

  test("should set utterance lang to navigator.language", () => {
    const onEnd = jest.fn();
    const { result } = renderHook(() =>
      useSpeechSynthesis({ ...DEFAULT_OPTIONS, onEnd })
    );

    act(() => {
      result.current.speak("Hello");
    });

    expect(mockUtterances[0].lang).toBe(navigator.language);
  });

  test("should cancel previous speech when speak is called again", () => {
    const onEnd = jest.fn();
    const { result } = renderHook(() =>
      useSpeechSynthesis({ ...DEFAULT_OPTIONS, onEnd })
    );

    act(() => {
      result.current.speak("First");
    });

    act(() => {
      result.current.speak("Second");
    });

    expect(mockSpeechSynthesis.cancel).toHaveBeenCalled();
    expect(result.current.isSpeaking).toBe(true);
  });

  test("should apply volume and rate to utterance", () => {
    const onEnd = jest.fn();
    const { result } = renderHook(() =>
      useSpeechSynthesis({ ...DEFAULT_OPTIONS, onEnd, volume: 0.5, rate: 1.5 })
    );

    act(() => {
      result.current.speak("Hello");
    });

    expect(mockUtterances[0].volume).toBe(0.5);
    expect(mockUtterances[0].rate).toBe(1.5);
  });

  test("should apply voice when voiceURI matches an available voice", () => {
    const onEnd = jest.fn();
    const { result } = renderHook(() =>
      useSpeechSynthesis({
        ...DEFAULT_OPTIONS,
        onEnd,
        voiceURI: "voice-1",
      })
    );

    act(() => {
      result.current.speak("Hello");
    });

    expect(mockUtterances[0].voice).toEqual({
      voiceURI: "voice-1",
      name: "Voice 1",
      lang: "ja-JP",
    });
  });

  test("should not set voice when voiceURI is null", () => {
    const onEnd = jest.fn();
    const { result } = renderHook(() =>
      useSpeechSynthesis({ ...DEFAULT_OPTIONS, onEnd, voiceURI: null })
    );

    act(() => {
      result.current.speak("Hello");
    });

    expect(mockUtterances[0].voice).toBeNull();
  });
});
