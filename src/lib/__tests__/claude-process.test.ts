import { EventEmitter } from "events";

jest.mock("child_process", () => ({
  spawn: jest.fn(),
}));

import { spawn } from "child_process";
import {
  buildStdinMessage,
  isTextDelta,
  isResultEvent,
  sendMessage,
} from "../claude-process";

const mockSpawn = spawn as jest.MockedFunction<typeof spawn>;

describe("buildStdinMessage", () => {
  test("should build NDJSON message with correct structure", () => {
    const result = buildStdinMessage("Hello Claude");

    expect(result).toEqual({
      type: "user",
      session_id: "",
      message: {
        role: "user",
        content: [{ type: "text", text: "Hello Claude" }],
      },
      parent_tool_use_id: null,
    });
  });

  test("should preserve message text exactly", () => {
    const text = "日本語テスト\n改行あり";
    const result = buildStdinMessage(text);

    expect(result.message.content[0].text).toBe(text);
  });
});

describe("isTextDelta", () => {
  test("should return true for valid text_delta stream events", () => {
    const event = {
      type: "stream_event",
      event: {
        type: "content_block_delta",
        delta: {
          type: "text_delta",
          text: "Hello",
        },
      },
    };

    expect(isTextDelta(event)).toBe(true);
  });

  test("should return false when type is not stream_event", () => {
    const event = {
      type: "result",
      event: {
        delta: { type: "text_delta", text: "Hello" },
      },
    };

    expect(isTextDelta(event)).toBe(false);
  });

  test("should return false when event is missing", () => {
    const event = { type: "stream_event" };

    expect(isTextDelta(event)).toBe(false);
  });

  test("should return false when delta is missing", () => {
    const event = {
      type: "stream_event",
      event: { type: "content_block_delta" },
    };

    expect(isTextDelta(event)).toBe(false);
  });

  test("should return false when delta type is not text_delta", () => {
    const event = {
      type: "stream_event",
      event: {
        type: "content_block_delta",
        delta: { type: "input_json_delta", partial_json: "{}" },
      },
    };

    expect(isTextDelta(event)).toBe(false);
  });

  test("should return false when delta text is not a string", () => {
    const event = {
      type: "stream_event",
      event: {
        type: "content_block_delta",
        delta: { type: "text_delta", text: 123 },
      },
    };

    expect(isTextDelta(event)).toBe(false);
  });
});

describe("isResultEvent", () => {
  test("should return true for result type", () => {
    expect(isResultEvent({ type: "result" })).toBe(true);
  });

  test("should return false for non-result types", () => {
    expect(isResultEvent({ type: "stream_event" })).toBe(false);
    expect(isResultEvent({ type: "control_request" })).toBe(false);
    expect(isResultEvent({})).toBe(false);
  });
});

function createMockProcess() {
  const proc = new EventEmitter();
  const stdin = { write: jest.fn() };
  const stdout = new EventEmitter();

  Object.assign(proc, {
    stdin,
    stdout,
    stderr: new EventEmitter(),
    exitCode: null,
    pid: 12345,
  });

  return proc as EventEmitter & {
    stdin: { write: jest.Mock };
    stdout: EventEmitter;
    exitCode: null;
  };
}

describe("sendMessage", () => {
  let mockProc: ReturnType<typeof createMockProcess>;

  beforeEach(() => {
    (globalThis as Record<string, unknown>).__claudeProcess = undefined;
    mockProc = createMockProcess();
    mockSpawn.mockReturnValue(mockProc as never);
  });

  afterEach(() => {
    (globalThis as Record<string, unknown>).__claudeProcess = undefined;
  });

  test("should write stdin message with correct format", () => {
    const onParsed = jest.fn();

    sendMessage("Hello", onParsed);

    expect(mockProc.stdin.write).toHaveBeenCalledTimes(1);
    const written = mockProc.stdin.write.mock.calls[0][0] as string;
    const parsed = JSON.parse(written.trim());
    expect(parsed.type).toBe("user");
    expect(parsed.message.content[0].text).toBe("Hello");
  });

  test("should call callback with parsed stdout data", () => {
    const onParsed = jest.fn();

    sendMessage("Hello", onParsed);

    const event = {
      type: "stream_event",
      event: { delta: { type: "text_delta", text: "Hi" } },
    };
    mockProc.stdout.emit("data", Buffer.from(JSON.stringify(event) + "\n"));

    expect(onParsed).toHaveBeenCalledWith(event);
  });

  test("should resolve done promise on result event", async () => {
    const onParsed = jest.fn();
    const { done } = sendMessage("Hello", onParsed);

    const resultEvent = { type: "result", subtype: "success" };
    mockProc.stdout.emit(
      "data",
      Buffer.from(JSON.stringify(resultEvent) + "\n")
    );

    await expect(done).resolves.toBeUndefined();
  });

  test("should reject previous promise when sending new message while busy", async () => {
    const onParsed1 = jest.fn();
    const { done: done1 } = sendMessage("First", onParsed1);

    // Attach handler before triggering rejection to prevent unhandled rejection
    const settled = done1.catch((err) => err);

    const onParsed2 = jest.fn();
    sendMessage("Second", onParsed2);

    const result = await settled;
    expect(result).toBeInstanceOf(Error);
    expect((result as Error).message).toBe("Interrupted by new message");
  });

  test("should reject done promise on process error", async () => {
    const onParsed = jest.fn();
    const { done } = sendMessage("Hello", onParsed);

    // Attach handler before triggering rejection
    const settled = done.catch((err) => err);

    mockProc.emit("error", new Error("Process crashed"));

    const result = await settled;
    expect(result).toBeInstanceOf(Error);
    expect((result as Error).message).toBe("Process crashed");
  });

  test("should reject done promise on process exit", async () => {
    const onParsed = jest.fn();
    const { done } = sendMessage("Hello", onParsed);

    // Attach handler before triggering rejection
    const settled = done.catch((err) => err);

    mockProc.emit("exit", 1);

    const result = await settled;
    expect(result).toBeInstanceOf(Error);
    expect((result as Error).message).toBe(
      "Claude CLI process exited with code 1"
    );
  });

  test("should respond to control_request with control_response on stdin", () => {
    const onParsed = jest.fn();

    sendMessage("Hello", onParsed);
    mockProc.stdin.write.mockClear();

    const controlRequest = {
      type: "control_request",
      request_id: "req-123",
    };
    mockProc.stdout.emit(
      "data",
      Buffer.from(JSON.stringify(controlRequest) + "\n")
    );

    expect(mockProc.stdin.write).toHaveBeenCalledTimes(1);
    const written = JSON.parse(
      mockProc.stdin.write.mock.calls[0][0] as string
    );
    expect(written.type).toBe("control_response");
    expect(written.response.request_id).toBe("req-123");
    expect(onParsed).not.toHaveBeenCalled();
  });

  test("should ignore control_request with non-string request_id", () => {
    const onParsed = jest.fn();

    sendMessage("Hello", onParsed);
    mockProc.stdin.write.mockClear();

    const controlRequest = {
      type: "control_request",
      request_id: 123,
    };
    mockProc.stdout.emit(
      "data",
      Buffer.from(JSON.stringify(controlRequest) + "\n")
    );

    expect(mockProc.stdin.write).not.toHaveBeenCalled();
    expect(onParsed).not.toHaveBeenCalled();
  });

  test("should ignore old response after interruption", async () => {
    const onParsed1 = jest.fn();
    const { done: done1 } = sendMessage("First", onParsed1);

    // Prevent unhandled rejection
    const settled = done1.catch(() => {});

    const onParsed2 = jest.fn();
    sendMessage("Second", onParsed2);

    await settled;

    const event = {
      type: "stream_event",
      event: { delta: { type: "text_delta", text: "old response" } },
    };
    mockProc.stdout.emit("data", Buffer.from(JSON.stringify(event) + "\n"));

    expect(onParsed1).not.toHaveBeenCalled();
    expect(onParsed2).toHaveBeenCalledWith(event);
  });
});
