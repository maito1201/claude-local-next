import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TtsSettingsPanel } from "../TtsSettingsPanel";
import {
  DEFAULT_TTS_SETTINGS,
  TTS_ENGINE_BROWSER,
  TTS_ENGINE_VOICEVOX,
  type TtsSettings,
} from "@/types/tts-settings";
import type { VoicevoxSpeaker } from "@/lib/voicevox-client";

function renderPanel(overrides: {
  settings?: TtsSettings;
  onUpdateSettings?: jest.Mock;
  speakers?: VoicevoxSpeaker[];
  browserVoices?: SpeechSynthesisVoice[];
  speakerLoadError?: string | null;
  onRefetchSpeakers?: jest.Mock;
  onClose?: jest.Mock;
} = {}) {
  const props = {
    settings: overrides.settings ?? DEFAULT_TTS_SETTINGS,
    onUpdateSettings: overrides.onUpdateSettings ?? jest.fn(),
    speakers: overrides.speakers ?? [],
    browserVoices: overrides.browserVoices ?? [],
    speakerLoadError: overrides.speakerLoadError ?? null,
    onRefetchSpeakers: overrides.onRefetchSpeakers ?? jest.fn(),
    onClose: overrides.onClose ?? jest.fn(),
  };
  return { ...render(<TtsSettingsPanel {...props} />), props };
}

describe("TtsSettingsPanel", () => {
  test("should render TTS設定 heading", () => {
    renderPanel();

    expect(screen.getByText("TTS設定")).toBeInTheDocument();
  });

  test("should render engine radio buttons", () => {
    renderPanel();

    expect(screen.getByLabelText("ブラウザTTS")).toBeInTheDocument();
    expect(screen.getByLabelText("VOICEVOX")).toBeInTheDocument();
  });

  test("should select browser engine by default", () => {
    renderPanel();

    const radio = screen.getByLabelText("ブラウザTTS") as HTMLInputElement;
    expect(radio.checked).toBe(true);
  });

  test("should call onUpdateSettings when engine changes", async () => {
    const user = userEvent.setup();
    const onUpdateSettings = jest.fn();
    renderPanel({ onUpdateSettings });

    await user.click(screen.getByLabelText("VOICEVOX"));

    expect(onUpdateSettings).toHaveBeenCalledTimes(1);
    const updater = onUpdateSettings.mock.calls[0][0];
    const result = updater(DEFAULT_TTS_SETTINGS);
    expect(result.engine).toBe(TTS_ENGINE_VOICEVOX);
  });

  test("should render volume slider", () => {
    renderPanel();

    expect(screen.getByText(/音量/)).toBeInTheDocument();
  });

  test("should call onUpdateSettings when volume changes", () => {
    const onUpdateSettings = jest.fn();
    renderPanel({ onUpdateSettings });

    const slider = screen.getByRole("slider", { name: /音量/ });
    fireEvent.change(slider, { target: { value: "0.5" } });

    expect(onUpdateSettings).toHaveBeenCalled();
    const updater = onUpdateSettings.mock.calls[0][0];
    const result = updater(DEFAULT_TTS_SETTINGS);
    expect(result.volume).toBe(0.5);
  });

  test("should render browser settings when browser engine selected", () => {
    renderPanel({
      settings: { ...DEFAULT_TTS_SETTINGS, engine: TTS_ENGINE_BROWSER },
    });

    expect(screen.getByText(/読み上げ速度/)).toBeInTheDocument();
    expect(screen.getByText("ボイス")).toBeInTheDocument();
  });

  test("should render voicevox settings when voicevox engine selected", () => {
    const speakers: VoicevoxSpeaker[] = [
      {
        name: "ずんだもん",
        speaker_uuid: "uuid",
        styles: [{ name: "ノーマル", id: 3 }],
      },
    ];

    renderPanel({
      settings: { ...DEFAULT_TTS_SETTINGS, engine: TTS_ENGINE_VOICEVOX },
      speakers,
    });

    expect(screen.getByText("キャラクター")).toBeInTheDocument();
    expect(screen.getByText(/読み上げ速度/)).toBeInTheDocument();
  });

  test("should show speaker options in voicevox mode", () => {
    const speakers: VoicevoxSpeaker[] = [
      {
        name: "ずんだもん",
        speaker_uuid: "uuid",
        styles: [
          { name: "ノーマル", id: 3 },
          { name: "あまあま", id: 4 },
        ],
      },
    ];

    renderPanel({
      settings: { ...DEFAULT_TTS_SETTINGS, engine: TTS_ENGINE_VOICEVOX },
      speakers,
    });

    expect(screen.getByText("ずんだもん (ノーマル)")).toBeInTheDocument();
    expect(screen.getByText("ずんだもん (あまあま)")).toBeInTheDocument();
  });

  test("should show error and retry button when speakerLoadError is set", () => {
    const onRefetchSpeakers = jest.fn();
    renderPanel({
      settings: { ...DEFAULT_TTS_SETTINGS, engine: TTS_ENGINE_VOICEVOX },
      speakerLoadError: "接続エラー",
      onRefetchSpeakers,
    });

    expect(screen.getByText("接続エラー")).toBeInTheDocument();
    expect(screen.getByText("再接続")).toBeInTheDocument();
  });

  test("should call onRefetchSpeakers when retry button clicked", async () => {
    const user = userEvent.setup();
    const onRefetchSpeakers = jest.fn();
    renderPanel({
      settings: { ...DEFAULT_TTS_SETTINGS, engine: TTS_ENGINE_VOICEVOX },
      speakerLoadError: "接続エラー",
      onRefetchSpeakers,
    });

    await user.click(screen.getByText("再接続"));

    expect(onRefetchSpeakers).toHaveBeenCalledTimes(1);
  });

  test("should call onClose when close button clicked", async () => {
    const user = userEvent.setup();
    const onClose = jest.fn();
    renderPanel({ onClose });

    await user.click(screen.getByRole("button", { name: "設定を閉じる" }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  test("should call onClose when overlay clicked", async () => {
    const user = userEvent.setup();
    const onClose = jest.fn();
    renderPanel({ onClose });

    // Click the overlay (first child with bg-black/50)
    const overlay = screen.getByText("TTS設定").closest(".fixed")!;
    await user.click(overlay);

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  test("should not call onClose when panel content clicked", async () => {
    const user = userEvent.setup();
    const onClose = jest.fn();
    renderPanel({ onClose });

    await user.click(screen.getByText("TTS設定"));

    expect(onClose).not.toHaveBeenCalled();
  });
});
