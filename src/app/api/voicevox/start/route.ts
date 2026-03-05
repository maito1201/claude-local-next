import {
  ensureVoicevoxRunning,
  isVoicevoxRunning,
} from "@/lib/voicevox-process";

export async function GET(): Promise<Response> {
  const running = await isVoicevoxRunning();
  return Response.json({ running });
}

export async function POST(): Promise<Response> {
  try {
    const result = await ensureVoicevoxRunning();
    return Response.json({ success: true, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return Response.json({ success: false, error: message }, { status: 500 });
  }
}
