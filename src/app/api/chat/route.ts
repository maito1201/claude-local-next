import { NextRequest } from "next/server";
import { sendMessage, isTextDelta, isResultEvent, isPermissionRequest } from "@/lib/claude-process";
import type { SSEChunk } from "@/types/chat";

interface ChatRequestBody {
  message: string;
}

function formatSSE(chunk: SSEChunk): string {
  return `data: ${JSON.stringify(chunk)}\n\n`;
}

export async function POST(request: NextRequest): Promise<Response> {
  const body = (await request.json()) as ChatRequestBody;
  if (!body.message || typeof body.message !== "string") {
    return new Response(
      JSON.stringify({ error: "message field is required" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      let closed = false;
      let result: { done: Promise<void> };

      try {
        result = sendMessage(
          body.message,
          (parsed: Record<string, unknown>) => {
            if (closed) return;

            if (isPermissionRequest(parsed)) {
              const request = parsed.request as Record<string, unknown>;
              const chunk: SSEChunk = {
                type: "permission_request",
                requestId: parsed.request_id as string,
                toolName: request.tool_name as string,
                input: request.input as Record<string, unknown>,
                description: request.description as string | undefined,
              };
              controller.enqueue(encoder.encode(formatSSE(chunk)));
            }

            if (isTextDelta(parsed)) {
              const chunk: SSEChunk = {
                type: "text_delta",
                text: parsed.event.delta.text,
              };
              controller.enqueue(encoder.encode(formatSSE(chunk)));
            }

            if (isResultEvent(parsed)) {
              const chunk: SSEChunk = { type: "result" };
              controller.enqueue(encoder.encode(formatSSE(chunk)));
              closed = true;
              controller.close();
            }
          }
        );
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : "Unknown error";
        const chunk: SSEChunk = { type: "error", error: errorMessage };
        controller.enqueue(encoder.encode(formatSSE(chunk)));
        closed = true;
        controller.close();
        return;
      }

      result.done.catch((err: unknown) => {
        if (closed) return;
        closed = true;
        const errorMessage =
          err instanceof Error ? err.message : "Unknown error";
        const chunk: SSEChunk = { type: "error", error: errorMessage };
        controller.enqueue(encoder.encode(formatSSE(chunk)));
        controller.close();
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
