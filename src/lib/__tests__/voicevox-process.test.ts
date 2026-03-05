import { EventEmitter } from "events";

// registerCleanup で process.on が呼ばれるのを抑止
const originalProcessOn = process.on.bind(process);
const processOnSpy = jest
  .spyOn(process, "on")
  .mockImplementation((...args: Parameters<typeof process.on>) => {
    // テスト中はSIGINT/SIGTERM/exitハンドラを登録しない
    const event = args[0];
    if (event === "exit" || event === "SIGINT" || event === "SIGTERM") {
      return process;
    }
    return originalProcessOn(...args);
  });

jest.mock("child_process", () => ({
  spawn: jest.fn(),
}));

import { spawn } from "child_process";
import {
  isVoicevoxRunning,
  ensureVoicevoxRunning,
  stopVoicevox,
} from "../voicevox-process";

const mockSpawn = spawn as jest.MockedFunction<typeof spawn>;

let mockFetch: jest.Mock;

function createMockDockerProcess() {
  const proc = new EventEmitter();
  Object.assign(proc, {
    stdin: null,
    stdout: new EventEmitter(),
    stderr: new EventEmitter(),
    exitCode: null,
    pid: 99999,
    kill: jest.fn(),
  });
  return proc as EventEmitter & {
    exitCode: null | number;
    kill: jest.Mock;
  };
}

beforeEach(() => {
  mockFetch = jest.fn();
  globalThis.fetch = mockFetch;
  (globalThis as Record<string, unknown>).__voicevoxProcess = undefined;
});

afterEach(() => {
  jest.restoreAllMocks();
  (globalThis as Record<string, unknown>).__voicevoxProcess = undefined;
});

describe("isVoicevoxRunning", () => {
  test("should return true when health endpoint responds ok", async () => {
    mockFetch.mockResolvedValue({ ok: true });

    const result = await isVoicevoxRunning();

    expect(result).toBe(true);
  });

  test("should return false when health endpoint fails", async () => {
    mockFetch.mockRejectedValue(new TypeError("Failed to fetch"));

    const result = await isVoicevoxRunning();

    expect(result).toBe(false);
  });

  test("should return false when health endpoint returns non-ok", async () => {
    mockFetch.mockResolvedValue({ ok: false });

    const result = await isVoicevoxRunning();

    expect(result).toBe(false);
  });
});

describe("ensureVoicevoxRunning", () => {
  test("should return already_running when VoiceVox is accessible", async () => {
    mockFetch.mockResolvedValue({ ok: true });

    const result = await ensureVoicevoxRunning();

    expect(result.status).toBe("already_running");
    expect(mockSpawn).not.toHaveBeenCalled();
  });

  test("should spawn docker and wait for ready", async () => {
    const mockProc = createMockDockerProcess();
    mockSpawn.mockReturnValue(mockProc as never);

    // 最初は接続失敗、2回目(waitForReady内)で成功
    let callCount = 0;
    mockFetch.mockImplementation(() => {
      callCount++;
      if (callCount <= 1) {
        return Promise.reject(new TypeError("Failed to fetch"));
      }
      return Promise.resolve({ ok: true });
    });

    const result = await ensureVoicevoxRunning();

    expect(result.status).toBe("started");
    expect(mockSpawn).toHaveBeenCalledWith(
      "docker",
      ["run", "--rm", "-p", "50021:50021", "voicevox/voicevox_engine:latest"],
      expect.objectContaining({ stdio: ["ignore", "pipe", "pipe"] })
    );
  });

  test("should return managed when process is alive and healthy", async () => {
    // まず起動
    const mockProc = createMockDockerProcess();
    mockSpawn.mockReturnValue(mockProc as never);

    let callCount = 0;
    mockFetch.mockImplementation(() => {
      callCount++;
      if (callCount <= 1) {
        return Promise.reject(new TypeError("Failed to fetch"));
      }
      return Promise.resolve({ ok: true });
    });

    await ensureVoicevoxRunning();

    // 2回目の呼び出し
    const result = await ensureVoicevoxRunning();
    expect(result.status).toBe("managed");
  });
});

describe("stopVoicevox", () => {
  test("should kill docker process", async () => {
    const mockProc = createMockDockerProcess();
    mockSpawn.mockReturnValue(mockProc as never);

    let callCount = 0;
    mockFetch.mockImplementation(() => {
      callCount++;
      if (callCount <= 1) {
        return Promise.reject(new TypeError("Failed to fetch"));
      }
      return Promise.resolve({ ok: true });
    });

    await ensureVoicevoxRunning();

    stopVoicevox();

    expect(mockProc.kill).toHaveBeenCalledWith("SIGTERM");
  });

  test("should do nothing when no process is managed", () => {
    expect(() => stopVoicevox()).not.toThrow();
  });
});
