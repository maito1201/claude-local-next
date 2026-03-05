import { renderHook, act } from "@testing-library/react";
import { useSpeechRecognition } from "../useSpeechRecognition";

interface MockSpeechRecognition {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: unknown) => void) | null;
  onend: (() => void) | null;
  onerror: ((event: { error: string; message: string }) => void) | null;
  start: jest.Mock;
  stop: jest.Mock;
}

function createMockRecognition(): MockSpeechRecognition {
  return {
    continuous: false,
    interimResults: false,
    lang: "",
    onresult: null,
    onend: null,
    onerror: null,
    start: jest.fn(),
    stop: jest.fn(),
  };
}

let mockRecognition: MockSpeechRecognition;

beforeEach(() => {
  jest.useFakeTimers();
  mockRecognition = createMockRecognition();
  window.SpeechRecognition = jest.fn(
    () => mockRecognition
  ) as unknown as SpeechRecognitionConstructor;
});

afterEach(() => {
  jest.useRealTimers();
  delete window.SpeechRecognition;
});

function createSpeechRecognitionEvent(
  results: Array<{ transcript: string; isFinal: boolean }>,
  resultIndex: number
): unknown {
  const speechResults = results.map((r) => {
    const result = [{ transcript: r.transcript }] as unknown as SpeechRecognitionResult;
    Object.defineProperty(result, "isFinal", { value: r.isFinal });
    return result;
  });

  return {
    resultIndex,
    results: Object.assign(speechResults, { length: speechResults.length }),
  };
}

describe("useSpeechRecognition", () => {
  test("should report isSupported as true when SpeechRecognition is available", () => {
    const onResult = jest.fn();
    const { result } = renderHook(() =>
      useSpeechRecognition({ onResult })
    );

    expect(result.current.isSupported).toBe(true);
  });

  test("should report isSupported as false when SpeechRecognition is unavailable", () => {
    delete window.SpeechRecognition;

    const onResult = jest.fn();
    const { result } = renderHook(() =>
      useSpeechRecognition({ onResult })
    );

    expect(result.current.isSupported).toBe(false);
  });

  test("should call recognition.start when enableVoiceMode is called", () => {
    const onResult = jest.fn();
    const { result } = renderHook(() =>
      useSpeechRecognition({ onResult })
    );

    act(() => {
      result.current.enableVoiceMode();
    });

    expect(mockRecognition.start).toHaveBeenCalledTimes(1);
    expect(result.current.voiceMode).toBe(true);
    expect(result.current.isListening).toBe(true);
  });

  test("should call recognition.stop and reset state when disableVoiceMode is called", () => {
    const onResult = jest.fn();
    const { result } = renderHook(() =>
      useSpeechRecognition({ onResult })
    );

    act(() => {
      result.current.enableVoiceMode();
    });

    act(() => {
      result.current.disableVoiceMode();
    });

    expect(mockRecognition.stop).toHaveBeenCalledTimes(1);
    expect(result.current.voiceMode).toBe(false);
    expect(result.current.isListening).toBe(false);
    expect(result.current.transcript).toBe("");
  });

  test("should update transcript on interim result", () => {
    const onResult = jest.fn();
    const { result } = renderHook(() =>
      useSpeechRecognition({ onResult })
    );

    act(() => {
      result.current.enableVoiceMode();
    });

    act(() => {
      const event = createSpeechRecognitionEvent(
        [{ transcript: "hello", isFinal: false }],
        0
      );
      mockRecognition.onresult!(event);
    });

    expect(result.current.transcript).toBe("hello");
    expect(onResult).not.toHaveBeenCalled();
  });

  test("should call onResult after 1 second of silence following final result", () => {
    const onResult = jest.fn();
    const { result } = renderHook(() =>
      useSpeechRecognition({ onResult })
    );

    act(() => {
      result.current.enableVoiceMode();
    });

    act(() => {
      const event = createSpeechRecognitionEvent(
        [{ transcript: "hello world", isFinal: true }],
        0
      );
      mockRecognition.onresult!(event);
    });

    expect(onResult).not.toHaveBeenCalled();

    act(() => {
      jest.advanceTimersByTime(1000);
    });

    expect(onResult).toHaveBeenCalledWith("hello world");
    expect(result.current.transcript).toBe("");
  });

  test("should reset silence timer on subsequent results", () => {
    const onResult = jest.fn();
    const { result } = renderHook(() =>
      useSpeechRecognition({ onResult })
    );

    act(() => {
      result.current.enableVoiceMode();
    });

    // First final result
    act(() => {
      const event = createSpeechRecognitionEvent(
        [{ transcript: "hello ", isFinal: true }],
        0
      );
      mockRecognition.onresult!(event);
    });

    // Advance 500ms (not enough to trigger)
    act(() => {
      jest.advanceTimersByTime(500);
    });

    expect(onResult).not.toHaveBeenCalled();

    // Second final result resets timer
    act(() => {
      const event = createSpeechRecognitionEvent(
        [
          { transcript: "hello ", isFinal: true },
          { transcript: "world", isFinal: true },
        ],
        1
      );
      mockRecognition.onresult!(event);
    });

    // 500ms more (1000ms total since first, but timer was reset)
    act(() => {
      jest.advanceTimersByTime(500);
    });

    expect(onResult).not.toHaveBeenCalled();

    // Remaining 500ms
    act(() => {
      jest.advanceTimersByTime(500);
    });

    expect(onResult).toHaveBeenCalledWith("hello world");
  });

  test("should set isListening to false on onend without restarting", () => {
    const onResult = jest.fn();
    const { result } = renderHook(() =>
      useSpeechRecognition({ onResult })
    );

    act(() => {
      result.current.enableVoiceMode();
    });

    expect(result.current.isListening).toBe(true);
    mockRecognition.start.mockClear();

    act(() => {
      mockRecognition.onend!();
    });

    expect(result.current.isListening).toBe(false);
    // voiceMode remains true
    expect(result.current.voiceMode).toBe(true);
    // No immediate restart attempt from onend
    expect(mockRecognition.start).not.toHaveBeenCalled();
  });

  test("should restart recognition via polling when voiceMode is on and recognition stopped", () => {
    const onResult = jest.fn();
    const { result } = renderHook(() =>
      useSpeechRecognition({ onResult })
    );

    act(() => {
      result.current.enableVoiceMode();
    });

    mockRecognition.start.mockClear();

    // Simulate recognition stopping
    act(() => {
      mockRecognition.onend!();
    });

    expect(result.current.isListening).toBe(false);
    expect(result.current.voiceMode).toBe(true);

    // Advance to next poll interval (3 seconds)
    act(() => {
      jest.advanceTimersByTime(3000);
    });

    expect(mockRecognition.start).toHaveBeenCalledTimes(1);
    expect(result.current.isListening).toBe(true);
  });

  test("should not restart via polling when voiceMode is off", () => {
    const onResult = jest.fn();
    const { result } = renderHook(() =>
      useSpeechRecognition({ onResult })
    );

    act(() => {
      result.current.enableVoiceMode();
    });

    act(() => {
      result.current.disableVoiceMode();
    });

    mockRecognition.start.mockClear();

    // Advance past poll interval
    act(() => {
      jest.advanceTimersByTime(3000);
    });

    expect(mockRecognition.start).not.toHaveBeenCalled();
  });

  test("should not restart via polling when suspended", () => {
    const onResult = jest.fn();
    const { result } = renderHook(() =>
      useSpeechRecognition({ onResult })
    );

    act(() => {
      result.current.enableVoiceMode();
    });

    act(() => {
      result.current.suspend();
    });

    expect(result.current.voiceMode).toBe(true);
    expect(result.current.isListening).toBe(false);

    mockRecognition.start.mockClear();

    // Advance past poll interval
    act(() => {
      jest.advanceTimersByTime(3000);
    });

    expect(mockRecognition.start).not.toHaveBeenCalled();
  });

  test("should restart recognition when resume is called while voiceMode is on", () => {
    const onResult = jest.fn();
    const { result } = renderHook(() =>
      useSpeechRecognition({ onResult })
    );

    act(() => {
      result.current.enableVoiceMode();
    });

    act(() => {
      result.current.suspend();
    });

    mockRecognition.start.mockClear();

    act(() => {
      result.current.resume();
    });

    expect(mockRecognition.start).toHaveBeenCalledTimes(1);
    expect(result.current.isListening).toBe(true);
  });

  test("should not restart recognition when resume is called while voiceMode is off", () => {
    const onResult = jest.fn();
    const { result } = renderHook(() =>
      useSpeechRecognition({ onResult })
    );

    // Never enabled voiceMode
    mockRecognition.start.mockClear();

    act(() => {
      result.current.resume();
    });

    expect(mockRecognition.start).not.toHaveBeenCalled();
  });

  test("should keep voiceMode true after onerror and restart via polling", () => {
    const onResult = jest.fn();
    const { result } = renderHook(() =>
      useSpeechRecognition({ onResult })
    );

    act(() => {
      result.current.enableVoiceMode();
    });

    act(() => {
      mockRecognition.onerror!({ error: "audio-capture", message: "No mic" });
    });

    expect(result.current.isListening).toBe(false);
    expect(result.current.error).toBe("audio-capture");
    // voiceMode stays true - polling will retry
    expect(result.current.voiceMode).toBe(true);

    mockRecognition.start.mockClear();

    // Polling should restart
    act(() => {
      jest.advanceTimersByTime(3000);
    });

    expect(mockRecognition.start).toHaveBeenCalledTimes(1);
    expect(result.current.isListening).toBe(true);
    expect(result.current.error).toBe("");
  });

  test("should handle polling restart failure gracefully and retry on next interval", () => {
    const onResult = jest.fn();
    const { result } = renderHook(() =>
      useSpeechRecognition({ onResult })
    );

    act(() => {
      result.current.enableVoiceMode();
    });

    // Simulate recognition stopping
    act(() => {
      mockRecognition.onend!();
    });

    // Make start throw on first poll
    mockRecognition.start
      .mockImplementationOnce(() => { throw new Error("not ready"); })
      .mockImplementationOnce(() => {});

    mockRecognition.start.mockClear();

    // First poll - should fail silently
    act(() => {
      jest.advanceTimersByTime(3000);
    });

    expect(mockRecognition.start).toHaveBeenCalledTimes(1);
    expect(result.current.isListening).toBe(false);

    // Second poll - should succeed
    act(() => {
      jest.advanceTimersByTime(3000);
    });

    expect(mockRecognition.start).toHaveBeenCalledTimes(2);
    expect(result.current.isListening).toBe(true);
  });

  test("should not restart recognition on onend when disableVoiceMode was called", () => {
    const onResult = jest.fn();
    const { result } = renderHook(() =>
      useSpeechRecognition({ onResult })
    );

    act(() => {
      result.current.enableVoiceMode();
    });

    act(() => {
      result.current.disableVoiceMode();
    });

    mockRecognition.start.mockClear();

    act(() => {
      mockRecognition.onend!();
    });

    expect(mockRecognition.start).not.toHaveBeenCalled();

    // Also no polling restart
    act(() => {
      jest.advanceTimersByTime(3000);
    });

    expect(mockRecognition.start).not.toHaveBeenCalled();
  });

  test("should configure recognition with correct settings", () => {
    const onResult = jest.fn();
    renderHook(() => useSpeechRecognition({ onResult }));

    expect(mockRecognition.continuous).toBe(true);
    expect(mockRecognition.interimResults).toBe(true);
    expect(mockRecognition.lang).toBe(navigator.language);
  });

  test("should set error and stop listening on onerror", () => {
    const onResult = jest.fn();
    const { result } = renderHook(() =>
      useSpeechRecognition({ onResult })
    );

    act(() => {
      result.current.enableVoiceMode();
    });

    act(() => {
      mockRecognition.onerror!({ error: "not-allowed", message: "Permission denied" });
    });

    expect(result.current.isListening).toBe(false);
    expect(result.current.error).toBe("not-allowed");
    expect(result.current.transcript).toBe("");
  });

  test("should clear error when enableVoiceMode is called again", () => {
    const onResult = jest.fn();
    const { result } = renderHook(() =>
      useSpeechRecognition({ onResult })
    );

    act(() => {
      result.current.enableVoiceMode();
    });

    act(() => {
      mockRecognition.onerror!({ error: "audio-capture", message: "No mic" });
    });

    expect(result.current.error).toBe("audio-capture");

    act(() => {
      result.current.enableVoiceMode();
    });

    expect(result.current.error).toBe("");
  });

  test("should stop polling when voiceMode is disabled", () => {
    const onResult = jest.fn();
    const { result } = renderHook(() =>
      useSpeechRecognition({ onResult })
    );

    act(() => {
      result.current.enableVoiceMode();
    });

    // Simulate recognition stopping
    act(() => {
      mockRecognition.onend!();
    });

    // Disable voice mode before poll fires
    act(() => {
      result.current.disableVoiceMode();
    });

    mockRecognition.start.mockClear();

    // Advance past poll interval
    act(() => {
      jest.advanceTimersByTime(3000);
    });

    expect(mockRecognition.start).not.toHaveBeenCalled();
  });

  test("suspend should stop recognition and prevent polling restart", () => {
    const onResult = jest.fn();
    const { result } = renderHook(() =>
      useSpeechRecognition({ onResult })
    );

    act(() => {
      result.current.enableVoiceMode();
    });

    expect(result.current.isListening).toBe(true);

    act(() => {
      result.current.suspend();
    });

    expect(mockRecognition.stop).toHaveBeenCalled();
    expect(result.current.isListening).toBe(false);
    expect(result.current.voiceMode).toBe(true);

    mockRecognition.start.mockClear();

    // Polling should not restart while suspended
    act(() => {
      jest.advanceTimersByTime(6000);
    });

    expect(mockRecognition.start).not.toHaveBeenCalled();
  });

  test("resume after suspend should restart and allow polling", () => {
    const onResult = jest.fn();
    const { result } = renderHook(() =>
      useSpeechRecognition({ onResult })
    );

    act(() => {
      result.current.enableVoiceMode();
    });

    act(() => {
      result.current.suspend();
    });

    mockRecognition.start.mockClear();

    act(() => {
      result.current.resume();
    });

    expect(mockRecognition.start).toHaveBeenCalledTimes(1);
    expect(result.current.isListening).toBe(true);

    // If recognition stops again, polling should restart
    act(() => {
      mockRecognition.onend!();
    });

    mockRecognition.start.mockClear();

    act(() => {
      jest.advanceTimersByTime(3000);
    });

    expect(mockRecognition.start).toHaveBeenCalledTimes(1);
  });
});
