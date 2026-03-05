import { parseSSELines } from "../sse-reader";

describe("parseSSELines", () => {
  test("should parse a single text_delta chunk", () => {
    const raw = 'data: {"type":"text_delta","text":"Hello"}\n\n';
    const { chunks, remaining } = parseSSELines(raw);

    expect(chunks).toEqual([{ type: "text_delta", text: "Hello" }]);
    expect(remaining).toBe("");
  });

  test("should parse multiple chunks", () => {
    const raw =
      'data: {"type":"text_delta","text":"Hello"}\n\ndata: {"type":"result"}\n\n';
    const { chunks, remaining } = parseSSELines(raw);

    expect(chunks).toHaveLength(2);
    expect(chunks[0]).toEqual({ type: "text_delta", text: "Hello" });
    expect(chunks[1]).toEqual({ type: "result" });
    expect(remaining).toBe("");
  });

  test("should return remaining buffer for incomplete line", () => {
    const raw = 'data: {"type":"text_delta","text":"Hi"}\n\ndata: {"type":"te';
    const { chunks, remaining } = parseSSELines(raw);

    expect(chunks).toEqual([{ type: "text_delta", text: "Hi" }]);
    expect(remaining).toBe('data: {"type":"te');
  });

  test("should skip non-data lines", () => {
    const raw = 'event: message\ndata: {"type":"result"}\n\n';
    const { chunks } = parseSSELines(raw);

    expect(chunks).toEqual([{ type: "result" }]);
  });

  test("should skip invalid JSON", () => {
    const raw = 'data: not json\ndata: {"type":"result"}\n\n';
    const { chunks } = parseSSELines(raw);

    expect(chunks).toEqual([{ type: "result" }]);
  });

  test("should parse error chunk", () => {
    const raw = 'data: {"type":"error","error":"Something went wrong"}\n\n';
    const { chunks } = parseSSELines(raw);

    expect(chunks).toEqual([
      { type: "error", error: "Something went wrong" },
    ]);
  });

  test("should return empty chunks for empty buffer", () => {
    const { chunks, remaining } = parseSSELines("");

    expect(chunks).toEqual([]);
    expect(remaining).toBe("");
  });

  test("should handle buffer with only incomplete data", () => {
    const raw = 'data: {"type":"text_del';
    const { chunks, remaining } = parseSSELines(raw);

    expect(chunks).toEqual([]);
    expect(remaining).toBe('data: {"type":"text_del');
  });
});
