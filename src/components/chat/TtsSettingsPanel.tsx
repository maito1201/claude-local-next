"use client";

import {
  TTS_ENGINE_BROWSER,
  TTS_ENGINE_VOICEVOX,
  type TtsEngine,
  type TtsSettings,
} from "@/types/tts-settings";
import type { VoicevoxSpeaker } from "@/lib/voicevox-client";
import { SliderField } from "@/components/ui/SliderField";

interface TtsSettingsPanelProps {
  settings: TtsSettings;
  onUpdateSettings: (updater: (prev: TtsSettings) => TtsSettings) => void;
  speakers: VoicevoxSpeaker[];
  browserVoices: SpeechSynthesisVoice[];
  speakerLoadError: string | null;
  onRefetchSpeakers: () => void;
  onClose: () => void;
}

const ENGINE_LABELS: Record<TtsEngine, string> = {
  [TTS_ENGINE_BROWSER]: "ブラウザTTS",
  [TTS_ENGINE_VOICEVOX]: "VOICEVOX",
};

const ENGINE_OPTIONS = [TTS_ENGINE_BROWSER, TTS_ENGINE_VOICEVOX] as const;

const SELECT_CLASS = "w-full mt-1 rounded-md border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-700 px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100";

export function TtsSettingsPanel({
  settings,
  onUpdateSettings,
  speakers,
  browserVoices,
  speakerLoadError,
  onRefetchSpeakers,
  onClose,
}: TtsSettingsPanelProps) {
  function handleEngineChange(engine: TtsEngine) {
    onUpdateSettings((prev) => ({ ...prev, engine }));
  }

  function handleVolumeChange(volume: number) {
    onUpdateSettings((prev) => ({ ...prev, volume }));
  }

  function handleBrowserRateChange(rate: number) {
    onUpdateSettings((prev) => ({
      ...prev,
      browser: { ...prev.browser, rate },
    }));
  }

  function handleBrowserVoiceChange(voiceURI: string | null) {
    onUpdateSettings((prev) => ({
      ...prev,
      browser: { ...prev.browser, voiceURI },
    }));
  }

  function handleVoicevoxSpeakerChange(speakerId: number) {
    onUpdateSettings((prev) => ({
      ...prev,
      voicevox: { ...prev.voicevox, speakerId },
    }));
  }

  function handleVoicevoxSpeedChange(speedScale: number) {
    onUpdateSettings((prev) => ({
      ...prev,
      voicevox: { ...prev.voicevox, speedScale },
    }));
  }

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-zinc-800 rounded-lg p-6 max-w-md w-full mx-4 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
            TTS設定
          </h2>
          <button
            onClick={onClose}
            aria-label="設定を閉じる"
            className="text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 transition-colors text-xl leading-none px-1"
          >
            ✕
          </button>
        </div>

        <div className="space-y-5">
          <EngineSelector
            engine={settings.engine}
            onChange={handleEngineChange}
          />

          <SliderField
            label="音量"
            value={settings.volume}
            min={0}
            max={1}
            step={0.1}
            onChange={handleVolumeChange}
          />

          {settings.engine === TTS_ENGINE_BROWSER ? (
            <BrowserSettings
              rate={settings.browser.rate}
              voiceURI={settings.browser.voiceURI}
              voices={browserVoices}
              onRateChange={handleBrowserRateChange}
              onVoiceChange={handleBrowserVoiceChange}
            />
          ) : (
            <VoicevoxSettings
              speakerId={settings.voicevox.speakerId}
              speedScale={settings.voicevox.speedScale}
              speakers={speakers}
              error={speakerLoadError}
              onSpeakerChange={handleVoicevoxSpeakerChange}
              onSpeedChange={handleVoicevoxSpeedChange}
              onRetry={onRefetchSpeakers}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function EngineSelector({
  engine,
  onChange,
}: {
  engine: TtsEngine;
  onChange: (engine: TtsEngine) => void;
}) {
  return (
    <fieldset>
      <legend className="text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">
        TTS方式
      </legend>
      <div className="flex gap-4">
        {ENGINE_OPTIONS.map((option) => (
          <label key={option} className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              name="tts-engine"
              value={option}
              checked={engine === option}
              onChange={() => onChange(option)}
              className="accent-blue-500"
            />
            <span className="text-sm text-zinc-800 dark:text-zinc-200">
              {ENGINE_LABELS[option]}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function groupVoicesByLang(
  voices: SpeechSynthesisVoice[]
): { lang: string; voices: SpeechSynthesisVoice[] }[] {
  const groups = new Map<string, SpeechSynthesisVoice[]>();
  for (const voice of voices) {
    const lang = voice.lang || "unknown";
    const list = groups.get(lang);
    if (list) {
      list.push(voice);
    } else {
      groups.set(lang, [voice]);
    }
  }

  const entries = Array.from(groups.entries()).map(([lang, vs]) => ({
    lang,
    voices: vs.sort((a, b) => a.name.localeCompare(b.name)),
  }));

  entries.sort((a, b) => {
    const aIsJa = a.lang.startsWith("ja") ? 0 : 1;
    const bIsJa = b.lang.startsWith("ja") ? 0 : 1;
    if (aIsJa !== bIsJa) return aIsJa - bIsJa;
    return a.lang.localeCompare(b.lang);
  });

  return entries;
}

function BrowserSettings({
  rate,
  voiceURI,
  voices,
  onRateChange,
  onVoiceChange,
}: {
  rate: number;
  voiceURI: string | null;
  voices: SpeechSynthesisVoice[];
  onRateChange: (rate: number) => void;
  onVoiceChange: (voiceURI: string | null) => void;
}) {
  const voiceGroups = groupVoicesByLang(voices);

  return (
    <div className="space-y-4">
      <SliderField
        label="読み上げ速度"
        value={rate}
        min={0.5}
        max={2}
        step={0.1}
        onChange={onRateChange}
      />
      <label className="block">
        <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
          ボイス
        </span>
        <select
          value={voiceURI ?? ""}
          onChange={(e) => onVoiceChange(e.target.value || null)}
          className={SELECT_CLASS}
        >
          <option value="">デフォルト</option>
          {voiceGroups.map((group) => (
            <optgroup key={group.lang} label={group.lang}>
              {group.voices.map((voice) => (
                <option key={voice.voiceURI} value={voice.voiceURI}>
                  {voice.name}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </label>
    </div>
  );
}

function VoicevoxSettings({
  speakerId,
  speedScale,
  speakers,
  error,
  onSpeakerChange,
  onSpeedChange,
  onRetry,
}: {
  speakerId: number | null;
  speedScale: number;
  speakers: VoicevoxSpeaker[];
  error: string | null;
  onSpeakerChange: (speakerId: number) => void;
  onSpeedChange: (speedScale: number) => void;
  onRetry: () => void;
}) {
  if (error) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-red-500">{error}</p>
        <button
          onClick={onRetry}
          className="text-sm text-blue-500 hover:text-blue-600 underline"
        >
          再接続
        </button>
      </div>
    );
  }

  const speakerOptions = speakers.flatMap((speaker) =>
    speaker.styles.map((style) => ({
      id: style.id,
      label: `${speaker.name} (${style.name})`,
    }))
  );

  return (
    <div className="space-y-4">
      <label className="block">
        <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
          キャラクター
        </span>
        <select
          value={speakerId ?? ""}
          onChange={(e) => onSpeakerChange(Number(e.target.value))}
          className={SELECT_CLASS}
        >
          {speakerOptions.length === 0 && (
            <option value="">読み込み中...</option>
          )}
          {speakerOptions.map((option) => (
            <option key={option.id} value={option.id}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
      <SliderField
        label="読み上げ速度"
        value={speedScale}
        min={0.5}
        max={2}
        step={0.1}
        onChange={onSpeedChange}
      />
    </div>
  );
}
