export const CHUNK_MAX_LENGTH = 200;

export function splitTextIntoChunks(
  text: string,
  maxLength: number
): string[] {
  if (text.length <= maxLength) {
    return [text];
  }

  const chunks: string[] = [];
  let remaining = text;

  while (remaining.length > 0) {
    if (remaining.length <= maxLength) {
      chunks.push(remaining);
      break;
    }

    const segment = remaining.slice(0, maxLength);

    const sentenceEnd = Math.max(
      segment.lastIndexOf("。"),
      segment.lastIndexOf("！"),
      segment.lastIndexOf("？"),
      segment.lastIndexOf(". "),
      segment.lastIndexOf("! "),
      segment.lastIndexOf("? ")
    );

    if (sentenceEnd > 0) {
      chunks.push(remaining.slice(0, sentenceEnd + 1));
      remaining = remaining.slice(sentenceEnd + 1);
      continue;
    }

    const clauseEnd = Math.max(
      segment.lastIndexOf("、"),
      segment.lastIndexOf("，"),
      segment.lastIndexOf(", ")
    );

    if (clauseEnd > 0) {
      chunks.push(remaining.slice(0, clauseEnd + 1));
      remaining = remaining.slice(clauseEnd + 1);
      continue;
    }

    chunks.push(remaining.slice(0, maxLength));
    remaining = remaining.slice(maxLength);
  }

  return chunks;
}
