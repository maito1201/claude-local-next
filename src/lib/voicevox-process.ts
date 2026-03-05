import { spawn, type ChildProcess } from "child_process";

const VOICEVOX_HEALTH_URL = "http://localhost:50021/version";
const VOICEVOX_DOCKER_IMAGE =
  process.env.VOICEVOX_DOCKER_IMAGE ?? "voicevox/voicevox_engine:latest";
const VOICEVOX_PORT = 50021;
const HEALTH_CHECK_INTERVAL_MS = 500;
const HEALTH_CHECK_TIMEOUT_MS = 60_000;

interface VoicevoxProcessState {
  process: ChildProcess;
  ready: boolean;
}

const globalForVoicevox = globalThis as typeof globalThis & {
  __voicevoxProcess?: VoicevoxProcessState;
};

export async function isVoicevoxRunning(): Promise<boolean> {
  try {
    const res = await fetch(VOICEVOX_HEALTH_URL, {
      signal: AbortSignal.timeout(2000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

async function waitForReady(): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < HEALTH_CHECK_TIMEOUT_MS) {
    if (await isVoicevoxRunning()) {
      return;
    }
    await new Promise((resolve) =>
      setTimeout(resolve, HEALTH_CHECK_INTERVAL_MS)
    );
  }
  throw new Error(
    `VoiceVox engine did not become ready within ${HEALTH_CHECK_TIMEOUT_MS / 1000}s`
  );
}

function isProcessAlive(state: VoicevoxProcessState | undefined): boolean {
  return !!state && state.process.exitCode === null;
}

export async function ensureVoicevoxRunning(): Promise<{
  status: "already_running" | "started" | "managed";
}> {
  // 1. 既にヘルスチェックが通るなら何もしない（アプリ版 or 手動Docker）
  if (await isVoicevoxRunning()) {
    if (isProcessAlive(globalForVoicevox.__voicevoxProcess)) {
      return { status: "managed" };
    }
    return { status: "already_running" };
  }

  // 2. 管理中のプロセスがあればまだ起動途中の可能性があるので待つ
  if (isProcessAlive(globalForVoicevox.__voicevoxProcess)) {
    await waitForReady();
    return { status: "managed" };
  }

  // 3. Docker で起動する
  const proc = spawn(
    "docker",
    [
      "run",
      "--rm",
      "-p",
      `${VOICEVOX_PORT}:${VOICEVOX_PORT}`,
      VOICEVOX_DOCKER_IMAGE,
    ],
    {
      stdio: ["ignore", "pipe", "pipe"],
      detached: false,
    }
  );

  const state: VoicevoxProcessState = {
    process: proc,
    ready: false,
  };

  proc.on("error", (err) => {
    console.error("[voicevox-process] Docker process error:", err.message);
    globalForVoicevox.__voicevoxProcess = undefined;
  });

  proc.on("exit", (code) => {
    console.log(`[voicevox-process] Docker process exited with code ${code}`);
    globalForVoicevox.__voicevoxProcess = undefined;
  });

  globalForVoicevox.__voicevoxProcess = state;

  // 起動完了を待つ
  await waitForReady();
  state.ready = true;

  return { status: "started" };
}

export function stopVoicevox(): void {
  const state = globalForVoicevox.__voicevoxProcess;
  if (!state) return;

  if (state.process.exitCode === null) {
    state.process.kill("SIGTERM");
  }
  globalForVoicevox.__voicevoxProcess = undefined;
}

// プロセス終了時にクリーンアップ
function registerCleanup(): void {
  const handler = () => {
    stopVoicevox();
  };

  process.on("exit", handler);
  process.on("SIGINT", () => {
    handler();
    process.exit(0);
  });
  process.on("SIGTERM", () => {
    handler();
    process.exit(0);
  });
}

registerCleanup();
