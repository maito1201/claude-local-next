import { EventEmitter } from "events";

jest.mock("child_process", () => ({
  spawn: jest.fn(),
}));

import { spawn } from "child_process";
import {
  buildStdinMessage,
  isTextDelta,
  isResultEvent,
  isPermissionRequest,
  respondToPermission,
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

describe("isPermissionRequest", () => {
  test("should return true for can_use_tool control_request", () => {
    const event = {
      type: "control_request",
      request_id: "req-1",
      request: { subtype: "can_use_tool", tool_name: "Bash" },
    };

    expect(isPermissionRequest(event)).toBe(true);
  });

  test("should return false for non-can_use_tool control_request", () => {
    const event = {
      type: "control_request",
      request_id: "req-1",
      request: { subtype: "initialize" },
    };

    expect(isPermissionRequest(event)).toBe(false);
  });

  test("should return false for non-control_request types", () => {
    expect(isPermissionRequest({ type: "stream_event" })).toBe(false);
    expect(isPermissionRequest({ type: "result" })).toBe(false);
  });

  test("should return false when request is missing", () => {
    expect(
      isPermissionRequest({ type: "control_request" })
    ).toBe(false);
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

  test("should spawn CLI with --permission-prompt-tool stdio", () => {
    sendMessage("Hello", jest.fn());

    expect(mockSpawn).toHaveBeenCalledTimes(1);
    const args = mockSpawn.mock.calls[0][1] as string[];
    const flagIndex = args.indexOf("--permission-prompt-tool");
    expect(flagIndex).not.toBe(-1);
    expect(args[flagIndex + 1]).toBe("stdio");
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

  test("should auto-respond to control_request without can_use_tool subtype", () => {
    const onParsed = jest.fn();

    sendMessage("Hello", onParsed);
    mockProc.stdin.write.mockClear();

    const controlRequest = {
      type: "control_request",
      request_id: "req-123",
      request: { subtype: "initialize" },
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
    expect(written.response.response).toBeNull();
    expect(onParsed).not.toHaveBeenCalled();
  });

  test("should forward can_use_tool control_request to callback", () => {
    const onParsed = jest.fn();

    sendMessage("Hello", onParsed);
    mockProc.stdin.write.mockClear();

    const controlRequest = {
      type: "control_request",
      request_id: "req-456",
      request: {
        subtype: "can_use_tool",
        tool_name: "Bash",
        input: { command: "ls" },
      },
    };
    mockProc.stdout.emit(
      "data",
      Buffer.from(JSON.stringify(controlRequest) + "\n")
    );

    expect(mockProc.stdin.write).not.toHaveBeenCalled();
    expect(onParsed).toHaveBeenCalledWith(controlRequest);
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

  test("should deny can_use_tool request with missing tool_name", () => {
    const onParsed = jest.fn();

    sendMessage("Hello", onParsed);
    mockProc.stdin.write.mockClear();

    const controlRequest = {
      type: "control_request",
      request_id: "req-no-tool",
      request: { subtype: "can_use_tool", input: { command: "ls" } },
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
    expect(written.response.request_id).toBe("req-no-tool");
    expect(written.response.response.behavior).toBe("deny");
    expect(onParsed).not.toHaveBeenCalled();
  });

  test("should deny pending permissions on interruption", () => {
    const onParsed1 = jest.fn();
    const { done: done1 } = sendMessage("First", onParsed1);
    done1.catch(() => {});

    mockProc.stdin.write.mockClear();

    // Emit a can_use_tool request to create a pending permission
    const controlRequest = {
      type: "control_request",
      request_id: "perm-1",
      request: { subtype: "can_use_tool", tool_name: "Bash", input: {} },
    };
    mockProc.stdout.emit(
      "data",
      Buffer.from(JSON.stringify(controlRequest) + "\n")
    );
    mockProc.stdin.write.mockClear();

    // Send new message (interrupts)
    sendMessage("Second", jest.fn());

    // The pending permission should have been denied
    const denyWritten = JSON.parse(
      mockProc.stdin.write.mock.calls[0][0] as string
    );
    expect(denyWritten.type).toBe("control_response");
    expect(denyWritten.response.request_id).toBe("perm-1");
    expect(denyWritten.response.response.behavior).toBe("deny");
  });

  test("should allow pending permission via respondToPermission with updatedInput", () => {
    const onParsed = jest.fn();
    sendMessage("Hello", onParsed);
    mockProc.stdin.write.mockClear();

    const toolInput = { command: "ls -la" };
    const controlRequest = {
      type: "control_request",
      request_id: "perm-allow",
      request: { subtype: "can_use_tool", tool_name: "Bash", input: toolInput },
    };
    mockProc.stdout.emit(
      "data",
      Buffer.from(JSON.stringify(controlRequest) + "\n")
    );
    mockProc.stdin.write.mockClear();

    respondToPermission("perm-allow", true);

    expect(mockProc.stdin.write).toHaveBeenCalledTimes(1);
    const written = JSON.parse(
      mockProc.stdin.write.mock.calls[0][0] as string
    );
    expect(written.response.response).toEqual({ behavior: "allow", updatedInput: toolInput });
  });

  test("should allow always with updatedPermissions", () => {
    const onParsed = jest.fn();
    sendMessage("Hello", onParsed);
    mockProc.stdin.write.mockClear();

    const toolInput = { file_path: "/tmp/test.txt" };
    const controlRequest = {
      type: "control_request",
      request_id: "perm-always",
      request: { subtype: "can_use_tool", tool_name: "Edit", input: toolInput },
    };
    mockProc.stdout.emit(
      "data",
      Buffer.from(JSON.stringify(controlRequest) + "\n")
    );
    mockProc.stdin.write.mockClear();

    respondToPermission("perm-always", true, { alwaysAllow: true });

    expect(mockProc.stdin.write).toHaveBeenCalledTimes(1);
    const written = JSON.parse(
      mockProc.stdin.write.mock.calls[0][0] as string
    );
    expect(written.response.response).toEqual({
      behavior: "allow",
      updatedInput: toolInput,
      updatedPermissions: [
        {
          type: "addRules",
          rules: [{ toolName: "Edit" }],
          behavior: "allow",
          destination: "session",
        },
      ],
    });
  });

  test("should auto-allow subsequent requests for alwaysAllow tools", () => {
    const onParsed = jest.fn();
    sendMessage("Hello", onParsed);
    mockProc.stdin.write.mockClear();

    // First request: user allows with alwaysAllow
    const firstRequest = {
      type: "control_request",
      request_id: "perm-first",
      request: { subtype: "can_use_tool", tool_name: "Bash", input: { command: "ls" } },
    };
    mockProc.stdout.emit(
      "data",
      Buffer.from(JSON.stringify(firstRequest) + "\n")
    );
    expect(onParsed).toHaveBeenCalledWith(firstRequest);
    mockProc.stdin.write.mockClear();

    respondToPermission("perm-first", true, { alwaysAllow: true });
    mockProc.stdin.write.mockClear();
    onParsed.mockClear();

    // Second request for the same tool: should be auto-allowed
    const secondRequest = {
      type: "control_request",
      request_id: "perm-second",
      request: { subtype: "can_use_tool", tool_name: "Bash", input: { command: "pwd" } },
    };
    mockProc.stdout.emit(
      "data",
      Buffer.from(JSON.stringify(secondRequest) + "\n")
    );

    // Should NOT forward to callback (auto-handled)
    expect(onParsed).not.toHaveBeenCalled();

    // Should have auto-responded with allow
    expect(mockProc.stdin.write).toHaveBeenCalledTimes(1);
    const written = JSON.parse(
      mockProc.stdin.write.mock.calls[0][0] as string
    );
    expect(written.response.response).toEqual({
      behavior: "allow",
      updatedInput: { command: "pwd" },
    });
  });

  test("should not auto-allow tools that were not marked alwaysAllow", () => {
    const onParsed = jest.fn();
    sendMessage("Hello", onParsed);
    mockProc.stdin.write.mockClear();

    // Allow Bash with alwaysAllow
    const bashRequest = {
      type: "control_request",
      request_id: "perm-bash",
      request: { subtype: "can_use_tool", tool_name: "Bash", input: { command: "ls" } },
    };
    mockProc.stdout.emit(
      "data",
      Buffer.from(JSON.stringify(bashRequest) + "\n")
    );
    respondToPermission("perm-bash", true, { alwaysAllow: true });
    mockProc.stdin.write.mockClear();
    onParsed.mockClear();

    // Request for a different tool (Write) should NOT be auto-allowed
    const writeRequest = {
      type: "control_request",
      request_id: "perm-write",
      request: { subtype: "can_use_tool", tool_name: "Write", input: { file_path: "/tmp/x" } },
    };
    mockProc.stdout.emit(
      "data",
      Buffer.from(JSON.stringify(writeRequest) + "\n")
    );

    // Should forward to callback (not auto-handled)
    expect(onParsed).toHaveBeenCalledWith(writeRequest);
    // Should NOT have auto-responded
    expect(mockProc.stdin.write).not.toHaveBeenCalled();
  });

  test("should deny pending permission via respondToPermission", () => {
    const onParsed = jest.fn();
    sendMessage("Hello", onParsed);
    mockProc.stdin.write.mockClear();

    const controlRequest = {
      type: "control_request",
      request_id: "perm-deny",
      request: { subtype: "can_use_tool", tool_name: "Write", input: {} },
    };
    mockProc.stdout.emit(
      "data",
      Buffer.from(JSON.stringify(controlRequest) + "\n")
    );
    mockProc.stdin.write.mockClear();

    respondToPermission("perm-deny", false);

    expect(mockProc.stdin.write).toHaveBeenCalledTimes(1);
    const written = JSON.parse(
      mockProc.stdin.write.mock.calls[0][0] as string
    );
    expect(written.response.response.behavior).toBe("deny");
    expect(written.response.response.message).toBe(
      "User denied this action"
    );
  });

  test("should throw when respondToPermission called with unknown requestId", () => {
    sendMessage("Hello", jest.fn());

    expect(() => respondToPermission("unknown-id", true)).toThrow(
      "No pending permission request: unknown-id"
    );
  });

  test("should throw when respondToPermission called without running process", () => {
    // No process started
    expect(() => respondToPermission("any-id", true)).toThrow(
      "Claude CLI process is not running"
    );
  });

  test("should handle JSON line split across multiple data chunks", () => {
    const onParsed = jest.fn();

    sendMessage("Hello", onParsed);

    const event = {
      type: "stream_event",
      event: { delta: { type: "text_delta", text: "Hi" } },
    };
    const json = JSON.stringify(event);
    const mid = Math.floor(json.length / 2);

    // First chunk: first half of the JSON (no newline)
    mockProc.stdout.emit("data", Buffer.from(json.slice(0, mid)));
    expect(onParsed).not.toHaveBeenCalled();

    // Second chunk: second half of the JSON + newline
    mockProc.stdout.emit("data", Buffer.from(json.slice(mid) + "\n"));
    expect(onParsed).toHaveBeenCalledTimes(1);
    expect(onParsed).toHaveBeenCalledWith(event);
  });

  test("should handle multiple JSON lines in a single data chunk", () => {
    const onParsed = jest.fn();

    sendMessage("Hello", onParsed);

    const event1 = {
      type: "stream_event",
      event: { delta: { type: "text_delta", text: "A" } },
    };
    const event2 = {
      type: "stream_event",
      event: { delta: { type: "text_delta", text: "B" } },
    };
    mockProc.stdout.emit(
      "data",
      Buffer.from(JSON.stringify(event1) + "\n" + JSON.stringify(event2) + "\n")
    );

    expect(onParsed).toHaveBeenCalledTimes(2);
    expect(onParsed).toHaveBeenNthCalledWith(1, event1);
    expect(onParsed).toHaveBeenNthCalledWith(2, event2);
  });

  test("should buffer trailing partial line across three chunks", () => {
    const onParsed = jest.fn();

    sendMessage("Hello", onParsed);

    const event1 = {
      type: "stream_event",
      event: { delta: { type: "text_delta", text: "X" } },
    };
    const event2 = {
      type: "stream_event",
      event: { delta: { type: "text_delta", text: "Y" } },
    };
    const json1 = JSON.stringify(event1);
    const json2 = JSON.stringify(event2);

    // Chunk 1: complete line + start of next line
    mockProc.stdout.emit(
      "data",
      Buffer.from(json1 + "\n" + json2.slice(0, 10))
    );
    expect(onParsed).toHaveBeenCalledTimes(1);
    expect(onParsed).toHaveBeenCalledWith(event1);

    // Chunk 2: middle of second line
    mockProc.stdout.emit(
      "data",
      Buffer.from(json2.slice(10, 30))
    );
    expect(onParsed).toHaveBeenCalledTimes(1);

    // Chunk 3: rest of second line + newline
    mockProc.stdout.emit(
      "data",
      Buffer.from(json2.slice(30) + "\n")
    );
    expect(onParsed).toHaveBeenCalledTimes(2);
    expect(onParsed).toHaveBeenNthCalledWith(2, event2);
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
