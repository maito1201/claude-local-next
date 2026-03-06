import { NextRequest } from "next/server";
import { respondToPermission } from "@/lib/claude-process";
import type { PermissionResponseBody } from "@/types/chat";

export async function POST(request: NextRequest): Promise<Response> {
  const body = (await request.json()) as PermissionResponseBody;

  if (!body.requestId || typeof body.requestId !== "string") {
    return Response.json({ error: "requestId is required" }, { status: 400 });
  }

  if (typeof body.allow !== "boolean") {
    return Response.json({ error: "allow field is required" }, { status: 400 });
  }

  try {
    respondToPermission(body.requestId, body.allow, {
      message: body.message,
      alwaysAllow: body.alwaysAllow,
    });
    return Response.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return Response.json({ error: message }, { status: 500 });
  }
}
