export const CHUNK_MAX_LENGTH = 200;

/** Sentence-ending patterns used for streaming extraction */
const SENTENCE_TERMINATORS = ["。", "！", "？", "! ", "? ", ". ", "\n"];

/**
 * Extract complete sentences from an accumulating buffer.
 * Returns the extracted sentences and the remaining (incomplete) buffer.
 *
 * Used during SSE streaming to feed sentences to TTS as soon as they are ready.
 */
export function extractSentences(buffer: string): {
  sentences: string[];
  remaining: string;
} {
  const sentences: string[] = [];
  let remaining = buffer;

  for (;;) {
    let earliestIdx = -1;
    let matchLen = 0;

    for (const term of SENTENCE_TERMINATORS) {
      const idx = remaining.indexOf(term);
      if (idx !== -1 && (earliestIdx === -1 || idx < earliestIdx)) {
        earliestIdx = idx;
        matchLen = term.length;
      }
    }

    if (earliestIdx === -1) break;

    const sentence = remaining.slice(0, earliestIdx + matchLen).trim();
    if (sentence) {
      sentences.push(sentence);
    }
    remaining = remaining.slice(earliestIdx + matchLen);
  }

  return { sentences, remaining };
}

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
