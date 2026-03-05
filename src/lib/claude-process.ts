import { spawn, type ChildProcess } from "child_process";
import type {
  ClaudeStdinMessage,
  ClaudeControlResponse,
} from "@/types/chat";

const CLAUDE_CLI_PATH =
  process.env.CLAUDE_CLI_PATH ?? "/Users/ito_masahiko/.local/bin/claude";

const CLAUDE_CLI_ARGS = [
  "--output-format",
  "stream-json",
  "--verbose",
  "--input-format",
  "stream-json",
  "--include-partial-messages",
  "--dangerously-skip-permissions",
] as const;

type MessageCallback = (parsed: Record<string, unknown>) => void;

interface ClaudeProcessState {
  process: ChildProcess;
  busy: boolean;
  currentCallback: MessageCallback | null;
  currentReject: ((err: Error) => void) | null;
  messageGeneration: number;
}

const globalForClaude = globalThis as typeof globalThis & {
  __claudeProcess?: ClaudeProcessState;
};

function ensureProcess(): ClaudeProcessState {
  if (globalForClaude.__claudeProcess?.process.exitCode === null) {
    return globalForClaude.__claudeProcess;
  }

  const proc = spawn(CLAUDE_CLI_PATH, [...CLAUDE_CLI_ARGS], {
    stdio: ["pipe", "pipe", "pipe"],
  });

  if (!proc.stdin || !proc.stdout) {
    throw new Error("Failed to create Claude CLI subprocess pipes");
  }

  const state: ClaudeProcessState = {
    process: proc,
    busy: false,
    currentCallback: null,
    currentReject: null,
    messageGeneration: 0,
  };

  proc.stdout.on("data", (chunk: Buffer) => {
    const lines = chunk.toString().split("\n");
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      handleStdoutLine(state, trimmed);
    }
  });

  proc.on("error", (err) => {
    if (state.currentReject) {
      state.currentReject(err instanceof Error ? err : new Error(String(err)));
      state.currentReject = null;
      state.currentCallback = null;
      state.busy = false;
    }
    globalForClaude.__claudeProcess = undefined;
  });

  proc.on("exit", (code) => {
    if (state.currentReject) {
      state.currentReject(
        new Error(`Claude CLI process exited with code ${code}`)
      );
      state.currentReject = null;
      state.currentCallback = null;
      state.busy = false;
    }
    globalForClaude.__claudeProcess = undefined;
  });

  globalForClaude.__claudeProcess = state;
  return state;
}

function handleStdoutLine(state: ClaudeProcessState, line: string): void {
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(line) as Record<string, unknown>;
  } catch {
    return;
  }

  if (parsed.type === "control_request") {
    handleControlRequest(state, parsed);
    return;
  }

  if (state.currentCallback) {
    state.currentCallback(parsed);
  }
}

function handleControlRequest(
  state: ClaudeProcessState,
  request: Record<string, unknown>
): void {
  const stdin = state.process.stdin;
  if (!stdin) return;

  if (typeof request.request_id !== "string") return;

  const response: ClaudeControlResponse = {
    type: "control_response",
    response: {
      subtype: "success",
      request_id: request.request_id,
      response: null,
    },
  };
  stdin.write(JSON.stringify(response) + "\n");
}

export function buildStdinMessage(text: string): ClaudeStdinMessage {
  return {
    type: "user",
    session_id: "",
    message: {
      role: "user",
      content: [{ type: "text", text }],
    },
    parent_tool_use_id: null,
  };
}

export function isTextDelta(
  parsed: Record<string, unknown>
): parsed is { type: "stream_event"; event: { delta: { type: "text_delta"; text: string } } } {
  if (parsed.type !== "stream_event") return false;
  const event = parsed.event as Record<string, unknown> | undefined;
  if (!event) return false;
  const delta = event.delta as Record<string, unknown> | undefined;
  if (!delta) return false;
  return delta.type === "text_delta" && typeof delta.text === "string";
}

export function isResultEvent(
  parsed: Record<string, unknown>
): boolean {
  return parsed.type === "result";
}

export function sendMessage(
  text: string,
  onParsed: MessageCallback
): { done: Promise<void> } {
  const state = ensureProcess();

  if (state.busy) {
    if (state.currentReject) {
      state.currentReject(new Error("Interrupted by new message"));
    }
    state.currentCallback = null;
    state.currentReject = null;
    state.busy = false;
  }

  const stdin = state.process.stdin;
  if (!stdin) {
    throw new Error("Claude CLI stdin is not available");
  }

  state.busy = true;
  const generation = ++state.messageGeneration;

  const message = buildStdinMessage(text);
  stdin.write(JSON.stringify(message) + "\n");

  const done = new Promise<void>((resolve, reject) => {
    state.currentReject = reject;
    state.currentCallback = (parsed: Record<string, unknown>) => {
      if (state.messageGeneration !== generation) return;

      onParsed(parsed);

      if (isResultEvent(parsed)) {
        state.busy = false;
        state.currentCallback = null;
        state.currentReject = null;
        resolve();
      }
    };
  });

  return { done };
}