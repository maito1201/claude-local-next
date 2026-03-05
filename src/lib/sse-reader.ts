import type { SSEChunk } from "@/types/chat";

export interface ParsedSSEResult {
  chunks: SSEChunk[];
  remaining: string;
}

export function parseSSELines(buffer: string): ParsedSSEResult {
  const lines = buffer.split("\n");
  // split always returns at least one element
  const remaining = lines.pop()!;
  const chunks: SSEChunk[] = [];

  for (const line of lines) {
    if (!line.startsWith("data: ")) continue;
    const jsonStr = line.slice(6);

    try {
      chunks.push(JSON.parse(jsonStr) as SSEChunk);
    } catch {
      continue;
    }
  }

  return { chunks, remaining };
}
