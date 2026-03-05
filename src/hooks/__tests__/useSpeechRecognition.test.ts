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

  test("should call recognition.start when start is called", () => {
    const onResult = jest.fn();
    const { result } = renderHook(() =>
      useSpeechRecognition({ onResult })
    );

    act(() => {
      result.current.start();
    });

    expect(mockRecognition.start).toHaveBeenCalledTimes(1);
    expect(result.current.isListening).toBe(true);
  });

  test("should call recognition.stop and reset state when stop is called", () => {
    const onResult = jest.fn();
    const { result } = renderHook(() =>
      useSpeechRecognition({ onResult })
    );

    act(() => {
      result.current.start();
    });

    act(() => {
      result.current.stop();
    });

    expect(mockRecognition.stop).toHaveBeenCalledTimes(1);
    expect(result.current.isListening).toBe(false);
    expect(result.current.transcript).toBe("");
  });

  test("should update transcript on interim result", () => {
    const onResult = jest.fn();
    const { result } = renderHook(() =>
      useSpeechRecognition({ onResult })
    );

    act(() => {
      result.current.start();
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
      result.current.start();
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
      result.current.start();
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

  test("should auto-restart recognition on onend when isListening is true", () => {
    const onResult = jest.fn();
    const { result } = renderHook(() =>
      useSpeechRecognition({ onResult })
    );

    act(() => {
      result.current.start();
    });

    expect(mockRecognition.start).toHaveBeenCalledTimes(1);

    act(() => {
      mockRecognition.onend!();
      jest.advanceTimersByTime(300);
    });

    expect(mockRecognition.start).toHaveBeenCalledTimes(2);
  });

  test("should retry with increasing delay when start throws on restart", () => {
    const onResult = jest.fn();
    const { result } = renderHook(() =>
      useSpeechRecognition({ onResult })
    );

    act(() => {
      result.current.start();
    });

    mockRecognition.start
      .mockImplementationOnce(() => { throw new Error("not ready"); })
      .mockImplementationOnce(() => {});

    mockRecognition.start.mockClear();

    act(() => {
      mockRecognition.onend!();
      jest.advanceTimersByTime(300);
    });

    expect(mockRecognition.start).toHaveBeenCalledTimes(1);
    expect(result.current.isListening).toBe(true);

    act(() => {
      jest.advanceTimersByTime(200);
    });

    expect(mockRecognition.start).toHaveBeenCalledTimes(2);
    expect(result.current.isListening).toBe(true);
  });

  test("should give up and set error after 5 failed restart attempts", () => {
    const onResult = jest.fn();
    const { result } = renderHook(() =>
      useSpeechRecognition({ onResult })
    );

    act(() => {
      result.current.start();
    });

    mockRecognition.start.mockImplementation(() => { throw new Error("fail"); });
    mockRecognition.start.mockClear();

    act(() => {
      mockRecognition.onend!();
      jest.advanceTimersByTime(300);
    });

    // Advance through all 5 retries: 200, 400, 600, 800, 1000
    act(() => {
      jest.advanceTimersByTime(200 + 400 + 600 + 800 + 1000);
    });

    expect(result.current.isListening).toBe(false);
    expect(result.current.error).toBe("restart-failed");
  });

  test("should not restart recognition on onend when stopped", () => {
    const onResult = jest.fn();
    const { result } = renderHook(() =>
      useSpeechRecognition({ onResult })
    );

    act(() => {
      result.current.start();
    });

    act(() => {
      result.current.stop();
    });

    mockRecognition.start.mockClear();

    act(() => {
      mockRecognition.onend!();
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
      result.current.start();
    });

    act(() => {
      mockRecognition.onerror!({ error: "not-allowed", message: "Permission denied" });
    });

    expect(result.current.isListening).toBe(false);
    expect(result.current.error).toBe("not-allowed");
    expect(result.current.transcript).toBe("");
  });

  test("should not restart recognition on onend after onerror", () => {
    const onResult = jest.fn();
    const { result } = renderHook(() =>
      useSpeechRecognition({ onResult })
    );

    act(() => {
      result.current.start();
    });

    act(() => {
      mockRecognition.onerror!({ error: "not-allowed", message: "Permission denied" });
    });

    mockRecognition.start.mockClear();

    act(() => {
      mockRecognition.onend!();
    });

    expect(mockRecognition.start).not.toHaveBeenCalled();
  });

  test("should clear error when start is called again", () => {
    const onResult = jest.fn();
    const { result } = renderHook(() =>
      useSpeechRecognition({ onResult })
    );

    act(() => {
      result.current.start();
    });

    act(() => {
      mockRecognition.onerror!({ error: "audio-capture", message: "No mic" });
    });

    expect(result.current.error).toBe("audio-capture");

    act(() => {
      result.current.start();
    });

    expect(result.current.error).toBe("");
  });
});
