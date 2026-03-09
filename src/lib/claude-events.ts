import type { ProcessingStateEventType } from "@/types/chat";

export interface ContentBlockStartInfo {
  blockType: ProcessingStateEventType;
  toolName?: string;
}

export function isPermissionRequest(parsed: Record<string, unknown>): boolean {
  if (parsed.type !== "control_request") return false;
  const request = parsed.request as Record<string, unknown> | undefined;
  return request?.subtype === "can_use_tool";
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

export function getContentBlockStartType(
  parsed: Record<string, unknown>
): ContentBlockStartInfo | null {
  if (parsed.type !== "stream_event") return null;
  const event = parsed.event as Record<string, unknown> | undefined;
  if (!event || event.type !== "content_block_start") return null;

  const contentBlock = event.content_block as Record<string, unknown> | undefined;
  if (!contentBlock) return null;
  if (
    contentBlock.type !== "thinking" &&
    contentBlock.type !== "tool_use" &&
    contentBlock.type !== "text"
  ) {
    return null;
  }

  if (contentBlock.type !== "tool_use") {
    return { blockType: contentBlock.type };
  }

  if (typeof contentBlock.name !== "string") {
    return null;
  }

  return {
    blockType: "tool_use",
    toolName: contentBlock.name,
  };
}

export function isResultEvent(parsed: Record<string, unknown>): boolean {
  return parsed.type === "result";
}
