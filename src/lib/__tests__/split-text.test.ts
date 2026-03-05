import { splitTextIntoChunks, CHUNK_MAX_LENGTH, extractSentences } from "../split-text";

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

describe("extractSentences", () => {
  test("should extract sentence ending with 。", () => {
    const { sentences, remaining } = extractSentences("こんにちは。残り");
    expect(sentences).toEqual(["こんにちは。"]);
    expect(remaining).toBe("残り");
  });

  test("should extract multiple sentences", () => {
    const { sentences, remaining } = extractSentences("一文目。二文目！三文目");
    expect(sentences).toEqual(["一文目。", "二文目！"]);
    expect(remaining).toBe("三文目");
  });

  test("should return empty sentences when no terminator found", () => {
    const { sentences, remaining } = extractSentences("途中のテキスト");
    expect(sentences).toEqual([]);
    expect(remaining).toBe("途中のテキスト");
  });

  test("should handle empty string", () => {
    const { sentences, remaining } = extractSentences("");
    expect(sentences).toEqual([]);
    expect(remaining).toBe("");
  });

  test("should extract sentence ending with ！", () => {
    const { sentences, remaining } = extractSentences("すごい！");
    expect(sentences).toEqual(["すごい！"]);
    expect(remaining).toBe("");
  });

  test("should extract sentence ending with ？", () => {
    const { sentences, remaining } = extractSentences("本当？はい。");
    expect(sentences).toEqual(["本当？", "はい。"]);
    expect(remaining).toBe("");
  });

  test("should handle newline as sentence terminator", () => {
    const { sentences, remaining } = extractSentences("行1\n行2\n途中");
    expect(sentences).toEqual(["行1", "行2"]);
    expect(remaining).toBe("途中");
  });

  test("should skip empty sentences from consecutive terminators", () => {
    const { sentences, remaining } = extractSentences("テスト。。次");
    expect(sentences[0]).toBe("テスト。");
    // The second 。 produces an empty string which should be skipped
    expect(sentences).toEqual(["テスト。", "。"]);
    expect(remaining).toBe("次");
  });
});
