import { splitTextIntoChunks, CHUNK_MAX_LENGTH } from "../split-text";

describe("splitTextIntoChunks", () => {
  test("should return single chunk when text is shorter than maxLength", () => {
    const text = "短いテキスト";
    const result = splitTextIntoChunks(text, CHUNK_MAX_LENGTH);

    expect(result).toEqual([text]);
  });

  test("should return single chunk when text equals maxLength", () => {
    const text = "あ".repeat(CHUNK_MAX_LENGTH);
    const result = splitTextIntoChunks(text, CHUNK_MAX_LENGTH);

    expect(result).toEqual([text]);
  });

  test("should split at sentence boundary (。)", () => {
    const text = "あ".repeat(100) + "。" + "い".repeat(150);
    const result = splitTextIntoChunks(text, CHUNK_MAX_LENGTH);

    expect(result[0]).toBe("あ".repeat(100) + "。");
  });

  test("should split at sentence boundary (！)", () => {
    const text = "あ".repeat(100) + "！" + "い".repeat(150);
    const result = splitTextIntoChunks(text, CHUNK_MAX_LENGTH);

    expect(result[0]).toBe("あ".repeat(100) + "！");
  });

  test("should split at sentence boundary (？)", () => {
    const text = "あ".repeat(100) + "？" + "い".repeat(150);
    const result = splitTextIntoChunks(text, CHUNK_MAX_LENGTH);

    expect(result[0]).toBe("あ".repeat(100) + "？");
  });

  test("should split at clause boundary (、) when no sentence boundary", () => {
    const text = "あ".repeat(100) + "、" + "い".repeat(150);
    const result = splitTextIntoChunks(text, CHUNK_MAX_LENGTH);

    expect(result[0]).toBe("あ".repeat(100) + "、");
  });

  test("should split at maxLength when no boundary found", () => {
    const text = "あ".repeat(300);
    const result = splitTextIntoChunks(text, CHUNK_MAX_LENGTH);

    expect(result[0]).toBe("あ".repeat(CHUNK_MAX_LENGTH));
    expect(result[1]).toBe("あ".repeat(100));
  });

  test("should produce all chunks covering the full text", () => {
    const text = "あ".repeat(500);
    const result = splitTextIntoChunks(text, CHUNK_MAX_LENGTH);

    const joined = result.join("");
    expect(joined).toBe(text);
  });

  test("should handle empty string", () => {
    const result = splitTextIntoChunks("", CHUNK_MAX_LENGTH);

    expect(result).toEqual([""]);
  });

  test("should prefer sentence boundary over clause boundary", () => {
    const text = "あ".repeat(80) + "、" + "い".repeat(10) + "。" + "う".repeat(150);
    const result = splitTextIntoChunks(text, CHUNK_MAX_LENGTH);

    expect(result[0]).toBe("あ".repeat(80) + "、" + "い".repeat(10) + "。");
  });
});
