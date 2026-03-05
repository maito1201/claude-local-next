import { VOICEVOX_DEFAULT_SPEAKER_NAME } from "@/types/tts-settings";

export const VOICEVOX_BASE_URL = "http://localhost:50021";

async function tryAutoStart(): Promise<boolean> {
  try {
    const res = await fetch("/api/voicevox/start", { method: "POST" });
    if (!res.ok) return false;
    const data = await res.json();
    return data.success === true;
  } catch {
    return false;
  }
}

export interface VoicevoxStyle {
  name: string;
  id: number;
}

export interface VoicevoxSpeaker {
  name: string;
  speaker_uuid: string;
  styles: VoicevoxStyle[];
}

export class VoicevoxConnectionError extends Error {
  constructor() {
    super(
      "VOICEVOXエンジンに接続できません。VOICEVOXが起動しているか確認してください。"
    );
    this.name = "VoicevoxConnectionError";
  }
}

export async function fetchSpeakers(): Promise<VoicevoxSpeaker[]> {
  let response: Response;
  try {
    response = await fetch(`${VOICEVOX_BASE_URL}/speakers`);
  } catch {
    // 接続失敗時にサーバー経由で自動起動を試みる
    const started = await tryAutoStart();
    if (!started) {
      throw new VoicevoxConnectionError();
    }
    // 起動成功したのでリトライ
    try {
      response = await fetch(`${VOICEVOX_BASE_URL}/speakers`);
    } catch {
      throw new VoicevoxConnectionError();
    }
  }

  if (!response.ok) {
    throw new Error(
      `VOICEVOXスピーカー一覧の取得に失敗しました: HTTP ${response.status}`
    );
  }

  return response.json();
}

export async function synthesize(
  text: string,
  speakerId: number,
  speedScale: number,
  volumeScale: number
): Promise<ArrayBuffer> {
  let queryResponse: Response;
  try {
    queryResponse = await fetch(
      `${VOICEVOX_BASE_URL}/audio_query?text=${encodeURIComponent(text)}&speaker=${speakerId}`,
      { method: "POST" }
    );
  } catch {
    throw new VoicevoxConnectionError();
  }

  if (!queryResponse.ok) {
    throw new Error(
      `VOICEVOXクエリ生成に失敗しました: HTTP ${queryResponse.status}`
    );
  }

  const audioQuery = await queryResponse.json();
  const modifiedQuery = { ...audioQuery, speedScale, volumeScale };

  let synthesisResponse: Response;
  try {
    synthesisResponse = await fetch(
      `${VOICEVOX_BASE_URL}/synthesis?speaker=${speakerId}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(modifiedQuery),
      }
    );
  } catch {
    throw new VoicevoxConnectionError();
  }

  if (!synthesisResponse.ok) {
    throw new Error(
      `VOICEVOX音声合成に失敗しました: HTTP ${synthesisResponse.status}`
    );
  }

  return synthesisResponse.arrayBuffer();
}

export function findDefaultSpeakerId(
  speakers: VoicevoxSpeaker[]
): number | null {
  const zundamon = speakers.find(
    (s) => s.name === VOICEVOX_DEFAULT_SPEAKER_NAME
  );
  if (zundamon && zundamon.styles.length > 0) {
    return zundamon.styles[0].id;
  }

  for (const speaker of speakers) {
    if (speaker.styles.length > 0) {
      return speaker.styles[0].id;
    }
  }

  return null;
}
