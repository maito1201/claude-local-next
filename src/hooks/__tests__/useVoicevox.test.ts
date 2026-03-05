import { renderHook, act } from "@testing-library/react";
import { useVoicevox } from "../useVoicevox";

jest.mock("@/lib/voicevox-client", () => ({
  synthesize: jest.fn(),
  VoicevoxConnectionError: class VoicevoxConnectionError extends Error {
    constructor() {
      super("VOICEVOXエンジンに接続できません。VOICEVOXが起動しているか確認してください。");
      this.name = "VoicevoxConnectionError";
    }
  },
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { synthesize, VoicevoxConnectionError } = require("@/lib/voicevox-client");

let mockAudioInstances: Array<{
  play: jest.Mock;
  pause: jest.Mock;
  volume: number;
  onended: (() => void) | null;
  onerror: (() => void) | null;
}>;

let mockCreateObjectURL: jest.Mock;
let mockRevokeObjectURL: jest.Mock;

beforeEach(() => {
  mockAudioInstances = [];
  jest.clearAllMocks();

  mockCreateObjectURL = jest.fn(() => "blob:mock-url");
  mockRevokeObjectURL = jest.fn();
  globalThis.URL.createObjectURL = mockCreateObjectURL;
  globalThis.URL.revokeObjectURL = mockRevokeObjectURL;

  globalThis.Audio = jest.fn(() => {
    const instance = {
      play: jest.fn(() => Promise.resolve()),
      pause: jest.fn(),
      volume: 1.0,
      onended: null,
      onerror: null,
    };
    mockAudioInstances.push(instance);
    return instance;
  }) as unknown as typeof Audio;
});

const DEFAULT_OPTIONS = {
  onEnd: jest.fn(),
  speakerId: 3,
  speedScale: 1.0,
  volume: 1.0,
};

describe("useVoicevox", () => {
  test("should set isSpeaking to true when speak is called", async () => {
    synthesize.mockResolvedValue(new ArrayBuffer(100));

    const onEnd = jest.fn();
    const { result } = renderHook(() =>
      useVoicevox({ ...DEFAULT_OPTIONS, onEnd })
    );

    await act(async () => {
      result.current.speak("テスト");
    });

    expect(result.current.isSpeaking).toBe(true);
    expect(synthesize).toHaveBeenCalledWith("テスト", 3, 1.0, 1.0);
  });

  test("should call onEnd after audio playback completes", async () => {
    synthesize.mockResolvedValue(new ArrayBuffer(100));

    const onEnd = jest.fn();
    const { result } = renderHook(() =>
      useVoicevox({ ...DEFAULT_OPTIONS, onEnd })
    );

    await act(async () => {
      result.current.speak("短いテスト");
    });

    await act(async () => {
      mockAudioInstances[0].onended!();
    });

    expect(result.current.isSpeaking).toBe(false);
    expect(onEnd).toHaveBeenCalledTimes(1);
  });

  test("should set error when speakerId is null", () => {
    const onEnd = jest.fn();
    const { result } = renderHook(() =>
      useVoicevox({ ...DEFAULT_OPTIONS, onEnd, speakerId: null })
    );

    act(() => {
      result.current.speak("テスト");
    });

    expect(result.current.error).toBe("キャラクターが選択されていません");
    expect(result.current.isSpeaking).toBe(false);
  });

  test("should set error on VoicevoxConnectionError", async () => {
    synthesize.mockRejectedValue(new VoicevoxConnectionError());

    const onEnd = jest.fn();
    const { result } = renderHook(() =>
      useVoicevox({ ...DEFAULT_OPTIONS, onEnd })
    );

    await act(async () => {
      result.current.speak("テスト");
    });

    expect(result.current.error).toContain("VOICEVOXエンジンに接続できません");
    expect(result.current.isSpeaking).toBe(false);
    expect(onEnd).toHaveBeenCalledTimes(1);
  });

  test("should stop playback and set isSpeaking to false when stop is called", async () => {
    synthesize.mockResolvedValue(new ArrayBuffer(100));

    const onEnd = jest.fn();
    const { result } = renderHook(() =>
      useVoicevox({ ...DEFAULT_OPTIONS, onEnd })
    );

    await act(async () => {
      result.current.speak("テスト");
    });

    act(() => {
      result.current.stop();
    });

    expect(mockAudioInstances[0].pause).toHaveBeenCalled();
    expect(result.current.isSpeaking).toBe(false);
  });

  test("should clear error when speaking again", async () => {
    synthesize.mockRejectedValueOnce(new VoicevoxConnectionError());
    synthesize.mockResolvedValueOnce(new ArrayBuffer(100));

    const onEnd = jest.fn();
    const { result } = renderHook(() =>
      useVoicevox({ ...DEFAULT_OPTIONS, onEnd })
    );

    await act(async () => {
      result.current.speak("失敗");
    });

    expect(result.current.error).not.toBeNull();

    await act(async () => {
      result.current.speak("成功");
    });

    expect(result.current.error).toBeNull();
  });

  test("should set error on audio playback failure", async () => {
    synthesize.mockResolvedValue(new ArrayBuffer(100));

    const onEnd = jest.fn();
    const { result } = renderHook(() =>
      useVoicevox({ ...DEFAULT_OPTIONS, onEnd })
    );

    await act(async () => {
      result.current.speak("テスト");
    });

    await act(async () => {
      mockAudioInstances[0].onerror!();
    });

    expect(result.current.error).toBe("音声の再生に失敗しました");
    expect(result.current.isSpeaking).toBe(false);
    expect(onEnd).toHaveBeenCalledTimes(1);
  });

  test("should revoke object URL after playback", async () => {
    synthesize.mockResolvedValue(new ArrayBuffer(100));

    const onEnd = jest.fn();
    const { result } = renderHook(() =>
      useVoicevox({ ...DEFAULT_OPTIONS, onEnd })
    );

    await act(async () => {
      result.current.speak("テスト");
    });

    await act(async () => {
      mockAudioInstances[0].onended!();
    });

    expect(mockRevokeObjectURL).toHaveBeenCalledWith("blob:mock-url");
  });
});
