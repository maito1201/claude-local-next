import { render, screen, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ChatContainer } from "../ChatContainer";
import { DEFAULT_TTS_SETTINGS } from "@/types/tts-settings";

const mockEnableVoiceMode = jest.fn();
const mockDisableVoiceMode = jest.fn();
const mockSuspend = jest.fn();
const mockResume = jest.fn();
let mockIsSupported = true;
let mockVoiceMode = false;
let capturedOnResult: ((text: string) => void) | null = null;

jest.mock("@/hooks/useSpeechRecognition", () => ({
  useSpeechRecognition: ({ onResult }: { onResult: (text: string) => void }) => {
    capturedOnResult = onResult;
    return {
      enableVoiceMode: mockEnableVoiceMode,
      disableVoiceMode: mockDisableVoiceMode,
      suspend: mockSuspend,
      resume: mockResume,
      voiceMode: mockVoiceMode,
      isListening: false,
      isSupported: mockIsSupported,
      transcript: "",
      error: "",
    };
  },
}));

const mockSpeak = jest.fn();
const mockEnqueueTts = jest.fn();
const mockFinishTtsStream = jest.fn();
const mockStopTts = jest.fn();
let mockIsTtsSupported = true;
let capturedOnEnd: (() => void) | null = null;

jest.mock("@/hooks/useTts", () => ({
  useTts: ({ onEnd }: { onEnd: () => void }) => {
    capturedOnEnd = onEnd;
    return {
      speak: mockSpeak,
      enqueue: mockEnqueueTts,
      finishStream: mockFinishTtsStream,
      stop: mockStopTts,
      isSpeaking: false,
      isSupported: mockIsTtsSupported,
      settings: DEFAULT_TTS_SETTINGS,
      updateSettings: jest.fn(),
      speakers: [],
      browserVoices: [],
      speakerLoadError: null,
      speakError: null,
      refetchSpeakers: jest.fn(),
    };
  },
}));

function createMockReader(
  chunks: string[]
): ReadableStreamDefaultReader<Uint8Array> {
  const encoder = new TextEncoder();
  let index = 0;

  return {
    read: async () => {
      if (index >= chunks.length) {
        return { done: true as const, value: undefined };
      }
      return {
        done: false as const,
        value: encoder.encode(chunks[index++]),
      };
    },
    releaseLock: () => {},
    cancel: async () => {},
    closed: Promise.resolve(undefined),
  } as unknown as ReadableStreamDefaultReader<Uint8Array>;
}

function createMockResponse(
  sseData: string[],
  status = 200
): Response {
  const reader = createMockReader(sseData);

  return {
    ok: status >= 200 && status < 300,
    status,
    body: {
      getReader: () => reader,
    },
    headers: new Headers(),
  } as unknown as Response;
}

describe("ChatContainer", () => {
  let mockFetch: jest.Mock;

  beforeEach(() => {
    mockFetch = jest.fn();
    globalThis.fetch = mockFetch;
    mockEnableVoiceMode.mockClear();
    mockDisableVoiceMode.mockClear();
    mockSuspend.mockClear();
    mockResume.mockClear();
    mockSpeak.mockClear();
    mockEnqueueTts.mockClear();
    mockFinishTtsStream.mockClear();
    mockStopTts.mockClear();
    mockIsSupported = true;
    mockIsTtsSupported = true;
    mockVoiceMode = false;
    capturedOnResult = null;
    capturedOnEnd = null;
  });

  test("should render input", () => {
    render(<ChatContainer />);

    expect(
      screen.getByPlaceholderText("メッセージを入力...")
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "送信 (Shift+ENTER)" })).toBeInTheDocument();
  });

  test("should show user message after send", async () => {
    const user = userEvent.setup();

    mockFetch.mockResolvedValue(
      createMockResponse(['data: {"type":"result"}\n\n'])
    );

    render(<ChatContainer />);

    await user.type(
      screen.getByPlaceholderText("メッセージを入力..."),
      "Hello"
    );
    await user.click(screen.getByRole("button", { name: "送信 (Shift+ENTER)" }));

    await waitFor(() => {
      expect(screen.getByText("Hello")).toBeInTheDocument();
    });
  });

  test("should show streamed assistant response", async () => {
    const user = userEvent.setup();

    mockFetch.mockResolvedValue(
      createMockResponse([
        'data: {"type":"text_delta","text":"Hi there"}\n\ndata: {"type":"result"}\n\n',
      ])
    );

    render(<ChatContainer />);

    await user.type(
      screen.getByPlaceholderText("メッセージを入力..."),
      "Hello"
    );
    await user.click(screen.getByRole("button", { name: "送信 (Shift+ENTER)" }));

    await waitFor(() => {
      expect(screen.getByText("Hi there")).toBeInTheDocument();
    });
  });

  test("should show error message on HTTP error", async () => {
    const user = userEvent.setup();

    mockFetch.mockResolvedValue(
      createMockResponse([], 500)
    );

    render(<ChatContainer />);

    await user.type(
      screen.getByPlaceholderText("メッセージを入力..."),
      "Hello"
    );
    await user.click(screen.getByRole("button", { name: "送信 (Shift+ENTER)" }));

    await waitFor(() => {
      expect(screen.getByText(/エラー: HTTP 500/)).toBeInTheDocument();
    });
  });

  test("should show error from SSE error event", async () => {
    const user = userEvent.setup();

    mockFetch.mockResolvedValue(
      createMockResponse([
        'data: {"type":"error","error":"Something went wrong"}\n\n',
      ])
    );

    render(<ChatContainer />);

    await user.type(
      screen.getByPlaceholderText("メッセージを入力..."),
      "Hello"
    );
    await user.click(screen.getByRole("button", { name: "送信 (Shift+ENTER)" }));

    await waitFor(() => {
      expect(
        screen.getByText(/エラー: Something went wrong/)
      ).toBeInTheDocument();
    });
  });

  test("should abort previous request when sending new message", async () => {
    const user = userEvent.setup();
    const abortSignals: AbortSignal[] = [];

    mockFetch.mockImplementationOnce(
      (_url: string, init: RequestInit) => {
        abortSignals.push(init.signal!);

        return new Promise<Response>((_resolve, reject) => {
          init.signal!.addEventListener("abort", () => {
            reject(new DOMException("Aborted", "AbortError"));
          });
        });
      }
    );

    mockFetch.mockImplementationOnce(
      (_url: string, init: RequestInit) => {
        abortSignals.push(init.signal!);
        return Promise.resolve(
          createMockResponse(['data: {"type":"result"}\n\n'])
        );
      }
    );

    render(<ChatContainer />);
    const input = screen.getByPlaceholderText("メッセージを入力...");

    await user.type(input, "First");
    await user.click(screen.getByRole("button", { name: "送信 (Shift+ENTER)" }));

    await user.type(input, "Second");
    await user.click(screen.getByRole("button", { name: "送信 (Shift+ENTER)" }));

    await waitFor(() => {
      expect(abortSignals).toHaveLength(2);
      expect(abortSignals[0].aborted).toBe(true);
    });
  });

  test("should silently ignore AbortError", async () => {
    const user = userEvent.setup();

    mockFetch.mockImplementation(
      (_url: string, init: RequestInit) => {
        return new Promise<Response>((_resolve, reject) => {
          if (init.signal) {
            init.signal.addEventListener("abort", () => {
              reject(new DOMException("Aborted", "AbortError"));
            });
          }
        });
      }
    );

    render(<ChatContainer />);
    const input = screen.getByPlaceholderText("メッセージを入力...");

    await user.type(input, "First");
    await user.click(screen.getByRole("button", { name: "送信 (Shift+ENTER)" }));

    mockFetch.mockResolvedValueOnce(
      createMockResponse(['data: {"type":"result"}\n\n'])
    );
    await user.type(input, "Second");
    await user.click(screen.getByRole("button", { name: "送信 (Shift+ENTER)" }));

    await waitFor(() => {
      expect(screen.getByText("First")).toBeInTheDocument();
      expect(screen.getByText("Second")).toBeInTheDocument();
    });

    expect(screen.queryByText(/エラー: Aborted/)).not.toBeInTheDocument();
  });

  test("should show voice toggle button when speech is supported", () => {
    mockIsSupported = true;
    render(<ChatContainer />);

    expect(
      screen.getByRole("button", { name: "音声入力を開始" })
    ).toBeInTheDocument();
  });

  test("should call enableVoiceMode on button click", async () => {
    const user = userEvent.setup();
    mockIsSupported = true;
    render(<ChatContainer />);

    await user.click(
      screen.getByRole("button", { name: "音声入力を開始" })
    );

    expect(mockEnableVoiceMode).toHaveBeenCalledTimes(1);
  });

  test("should call suspend on voice when sending message", async () => {
    mockIsSupported = true;

    mockFetch.mockResolvedValue(
      createMockResponse(['data: {"type":"result"}\n\n'])
    );

    render(<ChatContainer />);

    await act(async () => {
      capturedOnResult!("voice message");
    });

    await waitFor(() => {
      expect(mockSuspend).toHaveBeenCalled();
    });

    await waitFor(() => {
      expect(screen.getByText("voice message")).toBeInTheDocument();
    });
  });

  test("should call resume after response when voice mode is on", async () => {
    mockIsSupported = true;
    mockVoiceMode = true;

    mockFetch.mockResolvedValue(
      createMockResponse(['data: {"type":"result"}\n\n'])
    );

    render(<ChatContainer />);

    mockSuspend.mockClear();
    mockResume.mockClear();

    await act(async () => {
      capturedOnResult!("voice text");
    });

    await waitFor(() => {
      expect(mockSuspend).toHaveBeenCalled();
      expect(mockResume).toHaveBeenCalled();
    });
  });

  test("should not call resume after AbortError", async () => {
    const user = userEvent.setup();
    mockIsSupported = true;
    mockVoiceMode = true;

    mockFetch.mockImplementationOnce(
      (_url: string, init: RequestInit) => {
        return new Promise<Response>((_resolve, reject) => {
          init.signal!.addEventListener("abort", () => {
            reject(new DOMException("Aborted", "AbortError"));
          });
        });
      }
    );

    mockFetch.mockImplementationOnce(() =>
      Promise.resolve(
        createMockResponse(['data: {"type":"result"}\n\n'])
      )
    );

    render(<ChatContainer />);

    await act(async () => {
      capturedOnResult!("first");
    });

    mockResume.mockClear();

    await act(async () => {
      capturedOnResult!("second");
    });

    await waitFor(() => {
      expect(screen.getByText("second")).toBeInTheDocument();
    });

    // resume should be called once for the second request, not for the aborted one
    expect(mockResume).toHaveBeenCalledTimes(1);
  });

  test("should stream TTS via enqueue when TTS is enabled", async () => {
    const user = userEvent.setup();

    mockFetch.mockResolvedValue(
      createMockResponse([
        'data: {"type":"text_delta","text":"Hello world"}\n\ndata: {"type":"result"}\n\n',
      ])
    );

    render(<ChatContainer />);

    await user.click(
      screen.getByRole("button", { name: "読み上げをON" })
    );

    await user.type(
      screen.getByPlaceholderText("メッセージを入力..."),
      "Hi"
    );
    await user.click(screen.getByRole("button", { name: "送信 (Shift+ENTER)" }));

    await waitFor(() => {
      // Text without sentence boundary is flushed at end of stream
      expect(mockEnqueueTts).toHaveBeenCalledWith("Hello world");
      expect(mockFinishTtsStream).toHaveBeenCalled();
    });

    // speak should NOT be called in streaming mode
    expect(mockSpeak).not.toHaveBeenCalled();
  });

  test("should enqueue each sentence as it arrives during streaming TTS", async () => {
    const user = userEvent.setup();

    mockFetch.mockResolvedValue(
      createMockResponse([
        'data: {"type":"text_delta","text":"こんにちは。"}\n\n',
        'data: {"type":"text_delta","text":"今日はいい天気ですね。"}\n\n',
        'data: {"type":"text_delta","text":"残り"}\n\n',
        'data: {"type":"result"}\n\n',
      ])
    );

    render(<ChatContainer />);

    await user.click(
      screen.getByRole("button", { name: "読み上げをON" })
    );

    await user.type(
      screen.getByPlaceholderText("メッセージを入力..."),
      "Hi"
    );
    await user.click(screen.getByRole("button", { name: "送信 (Shift+ENTER)" }));

    await waitFor(() => {
      expect(mockFinishTtsStream).toHaveBeenCalled();
    });

    // Sentences with terminators should be enqueued as they arrive
    expect(mockEnqueueTts).toHaveBeenCalledWith("こんにちは。");
    expect(mockEnqueueTts).toHaveBeenCalledWith("今日はいい天気ですね。");
    // Remaining text without terminator is flushed at end
    expect(mockEnqueueTts).toHaveBeenCalledWith("残り");
  });

  test("should not call speak when TTS is disabled", async () => {
    const user = userEvent.setup();

    mockFetch.mockResolvedValue(
      createMockResponse([
        'data: {"type":"text_delta","text":"Hello"}\n\ndata: {"type":"result"}\n\n',
      ])
    );

    render(<ChatContainer />);

    await user.type(
      screen.getByPlaceholderText("メッセージを入力..."),
      "Hi"
    );
    await user.click(screen.getByRole("button", { name: "送信 (Shift+ENTER)" }));

    await waitFor(() => {
      expect(screen.getByText("Hello")).toBeInTheDocument();
    });

    expect(mockSpeak).not.toHaveBeenCalled();
  });

  test("should call stopTts when sending a new message", async () => {
    const user = userEvent.setup();

    mockFetch.mockResolvedValue(
      createMockResponse(['data: {"type":"result"}\n\n'])
    );

    render(<ChatContainer />);

    await user.type(
      screen.getByPlaceholderText("メッセージを入力..."),
      "Hi"
    );
    await user.click(screen.getByRole("button", { name: "送信 (Shift+ENTER)" }));

    await waitFor(() => {
      expect(mockStopTts).toHaveBeenCalled();
    });
  });

  test("should skip resume in finally when TTS is enabled", async () => {
    mockIsSupported = true;
    mockVoiceMode = true;

    mockFetch.mockResolvedValue(
      createMockResponse([
        'data: {"type":"text_delta","text":"response"}\n\ndata: {"type":"result"}\n\n',
      ])
    );

    render(<ChatContainer />);

    // Enable TTS
    const user = userEvent.setup();
    await user.click(
      screen.getByRole("button", { name: "読み上げをON" })
    );

    mockResume.mockClear();

    await act(async () => {
      capturedOnResult!("voice input");
    });

    await waitFor(() => {
      // Streaming TTS: enqueue + finishStream
      expect(mockEnqueueTts).toHaveBeenCalledWith("response");
      expect(mockFinishTtsStream).toHaveBeenCalled();
    });

    // resume should NOT be called in finally when TTS is enabled
    expect(mockResume).not.toHaveBeenCalled();
  });

  test("should call resume when onTtsEnd fires", async () => {
    mockIsSupported = true;
    mockVoiceMode = true;

    render(<ChatContainer />);

    mockResume.mockClear();

    act(() => {
      capturedOnEnd!();
    });

    expect(mockResume).toHaveBeenCalledTimes(1);
  });

  test("should show TTS settings button", () => {
    render(<ChatContainer />);

    expect(
      screen.getByRole("button", { name: "TTS設定" })
    ).toBeInTheDocument();
  });
});
