import { NextRequest } from "next/server";

jest.mock("@/lib/claude-process", () => ({
  sendMessage: jest.fn(),
  isTextDelta: jest.fn(),
  isResultEvent: jest.fn(),
}));

import { POST } from "../route";
import {
  sendMessage,
  isTextDelta,
  isResultEvent,
} from "@/lib/claude-process";

const mockSendMessage = sendMessage as jest.MockedFunction<typeof sendMessage>;
const mockIsTextDelta = isTextDelta as jest.MockedFunction<typeof isTextDelta>;
const mockIsResultEvent = isResultEvent as jest.MockedFunction<
  typeof isResultEvent
>;

function createRequest(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function readStream(response: Response): Promise<string> {
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let output = "";

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    output += decoder.decode(value);
  }

  return output;
}

describe("POST /api/chat", () => {
  beforeEach(() => {
    jest.resetAllMocks();
    mockIsTextDelta.mockImplementation(
      (parsed) => parsed.type === "stream_event"
    );
    mockIsResultEvent.mockImplementation(
      (parsed) => parsed.type === "result"
    );
  });

  test("should return 400 when message field is missing", async () => {
    const request = createRequest({});
    const response = await POST(request);

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBe("message field is required");
  });

  test("should return 400 when message is not a string", async () => {
    const request = createRequest({ message: 123 });
    const response = await POST(request);

    expect(response.status).toBe(400);
  });

  test("should stream text_delta and result SSE chunks", async () => {
    let capturedCallback: (parsed: Record<string, unknown>) => void;

    mockSendMessage.mockImplementation((_text, callback) => {
      capturedCallback = callback;
      return { done: new Promise<void>(() => {}) };
    });

    const request = createRequest({ message: "Hello" });
    const response = await POST(request);

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("text/event-stream");

    capturedCallback!({
      type: "stream_event",
      event: { delta: { type: "text_delta", text: "Hi" } },
    });
    capturedCallback!({ type: "result" });

    const output = await readStream(response);
    expect(output).toContain('"type":"text_delta"');
    expect(output).toContain('"text":"Hi"');
    expect(output).toContain('"type":"result"');
  });

  test("should return error SSE chunk when sendMessage throws synchronously", async () => {
    mockSendMessage.mockImplementation(() => {
      throw new Error("CLI not available");
    });

    const request = createRequest({ message: "Hello" });
    const response = await POST(request);

    expect(response.status).toBe(200);

    const output = await readStream(response);
    expect(output).toContain('"type":"error"');
    expect(output).toContain("CLI not available");
  });

  test("should return error SSE chunk when done promise rejects", async () => {
    let rejectDone: (err: Error) => void;

    mockSendMessage.mockImplementation((_text, _callback) => {
      const done = new Promise<void>((_resolve, reject) => {
        rejectDone = reject;
      });
      return { done };
    });

    const request = createRequest({ message: "Hello" });
    const response = await POST(request);

    rejectDone!(new Error("Process crashed"));

    const output = await readStream(response);
    expect(output).toContain('"type":"error"');
    expect(output).toContain("Process crashed");
  });

  test("should not write to closed controller after result event", async () => {
    let capturedCallback: (parsed: Record<string, unknown>) => void;
    let rejectDone: (err: Error) => void;

    mockSendMessage.mockImplementation((_text, callback) => {
      capturedCallback = callback;
      const done = new Promise<void>((_resolve, reject) => {
        rejectDone = reject;
      });
      return { done };
    });

    const request = createRequest({ message: "Hello" });
    const response = await POST(request);

    // Close the stream via result event
    capturedCallback!({ type: "result" });

    // Reject done after stream is already closed — should not throw
    rejectDone!(new Error("Late error"));

    const output = await readStream(response);
    expect(output).toContain('"type":"result"');
    expect(output).not.toContain("Late error");
  });
});
