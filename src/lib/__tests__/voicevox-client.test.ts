import {
  fetchSpeakers,
  synthesize,
  findDefaultSpeakerId,
  VoicevoxConnectionError,
  VOICEVOX_BASE_URL,
  type VoicevoxSpeaker,
} from "../voicevox-client";

let mockFetch: jest.Mock;

beforeEach(() => {
  mockFetch = jest.fn();
  globalThis.fetch = mockFetch;
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe("fetchSpeakers", () => {
  test("should return speakers from API", async () => {
    const speakers: VoicevoxSpeaker[] = [
      {
        name: "ずんだもん",
        speaker_uuid: "uuid-1",
        styles: [{ name: "ノーマル", id: 3 }],
      },
    ];
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(speakers),
    });

    const result = await fetchSpeakers();

    expect(result).toEqual(speakers);
    expect(mockFetch).toHaveBeenCalledWith(`${VOICEVOX_BASE_URL}/speakers`);
  });

  test("should auto-start VoiceVox and retry on network failure", async () => {
    const speakers: VoicevoxSpeaker[] = [
      {
        name: "ずんだもん",
        speaker_uuid: "uuid-1",
        styles: [{ name: "ノーマル", id: 3 }],
      },
    ];

    mockFetch
      // 1st call: speakers fetch fails
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      // 2nd call: auto-start API succeeds
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true, status: "started" }),
      })
      // 3rd call: retry speakers fetch succeeds
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(speakers),
      });

    const result = await fetchSpeakers();

    expect(result).toEqual(speakers);
    expect(mockFetch).toHaveBeenCalledTimes(3);
    expect(mockFetch).toHaveBeenNthCalledWith(2, "/api/voicevox/start", {
      method: "POST",
    });
  });

  test("should throw VoicevoxConnectionError when auto-start fails", async () => {
    mockFetch
      // 1st call: speakers fetch fails
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      // 2nd call: auto-start API fails
      .mockResolvedValueOnce({
        ok: false,
      });

    await expect(fetchSpeakers()).rejects.toThrow(VoicevoxConnectionError);
  });

  test("should throw VoicevoxConnectionError when retry after auto-start still fails", async () => {
    mockFetch
      // 1st call: speakers fetch fails
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      // 2nd call: auto-start API succeeds
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true, status: "started" }),
      })
      // 3rd call: retry speakers fetch still fails
      .mockRejectedValueOnce(new TypeError("Failed to fetch"));

    await expect(fetchSpeakers()).rejects.toThrow(VoicevoxConnectionError);
  });

  test("should throw on HTTP error", async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 500 });

    await expect(fetchSpeakers()).rejects.toThrow("HTTP 500");
  });
});

describe("synthesize", () => {
  test("should call audio_query then synthesis and return ArrayBuffer", async () => {
    const audioQuery = { speedScale: 1.0, volumeScale: 1.0, otherField: "value" };
    const wavBuffer = new ArrayBuffer(100);

    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ ...audioQuery }),
      })
      .mockResolvedValueOnce({
        ok: true,
        arrayBuffer: () => Promise.resolve(wavBuffer),
      });

    const result = await synthesize("こんにちは", 3, 1.2, 0.8);

    expect(result).toBe(wavBuffer);

    // Verify audio_query call
    expect(mockFetch).toHaveBeenCalledWith(
      `${VOICEVOX_BASE_URL}/audio_query?text=${encodeURIComponent("こんにちは")}&speaker=3`,
      { method: "POST" }
    );

    // Verify synthesis call with modified params
    const synthesisCall = mockFetch.mock.calls[1];
    expect(synthesisCall[0]).toBe(`${VOICEVOX_BASE_URL}/synthesis?speaker=3`);
    const body = JSON.parse(synthesisCall[1].body);
    expect(body.speedScale).toBe(1.2);
    expect(body.volumeScale).toBe(0.8);
  });

  test("should throw VoicevoxConnectionError on audio_query network failure", async () => {
    mockFetch.mockRejectedValue(new TypeError("Failed to fetch"));

    await expect(synthesize("text", 3, 1.0, 1.0)).rejects.toThrow(
      VoicevoxConnectionError
    );
  });

  test("should throw on audio_query HTTP error", async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 400 });

    await expect(synthesize("text", 3, 1.0, 1.0)).rejects.toThrow("HTTP 400");
  });

  test("should throw VoicevoxConnectionError on synthesis network failure", async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ speedScale: 1.0, volumeScale: 1.0 }),
      })
      .mockRejectedValueOnce(new TypeError("Failed to fetch"));

    await expect(synthesize("text", 3, 1.0, 1.0)).rejects.toThrow(
      VoicevoxConnectionError
    );
  });

  test("should throw on synthesis HTTP error", async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ speedScale: 1.0, volumeScale: 1.0 }),
      })
      .mockResolvedValueOnce({ ok: false, status: 500 });

    await expect(synthesize("text", 3, 1.0, 1.0)).rejects.toThrow("HTTP 500");
  });
});

describe("findDefaultSpeakerId", () => {
  test("should return ずんだもん first style id", () => {
    const speakers: VoicevoxSpeaker[] = [
      {
        name: "四国めたん",
        speaker_uuid: "uuid-1",
        styles: [{ name: "ノーマル", id: 1 }],
      },
      {
        name: "ずんだもん",
        speaker_uuid: "uuid-2",
        styles: [
          { name: "ノーマル", id: 3 },
          { name: "あまあま", id: 4 },
        ],
      },
    ];

    expect(findDefaultSpeakerId(speakers)).toBe(3);
  });

  test("should return first speaker style id when ずんだもん not found", () => {
    const speakers: VoicevoxSpeaker[] = [
      {
        name: "四国めたん",
        speaker_uuid: "uuid-1",
        styles: [{ name: "ノーマル", id: 1 }],
      },
    ];

    expect(findDefaultSpeakerId(speakers)).toBe(1);
  });

  test("should return null when no speakers available", () => {
    expect(findDefaultSpeakerId([])).toBeNull();
  });

  test("should return null when all speakers have no styles", () => {
    const speakers: VoicevoxSpeaker[] = [
      { name: "テスト", speaker_uuid: "uuid-1", styles: [] },
    ];

    expect(findDefaultSpeakerId(speakers)).toBeNull();
  });
});
