"use client";

import { useState, type FormEvent, type KeyboardEvent } from "react";

interface MessageInputProps {
  onSend: (message: string) => void;
  isListening: boolean;
  onToggleVoiceMode: () => void;
  isVoiceSupported: boolean;
  transcript: string;
  ttsEnabled: boolean;
  isSpeaking: boolean;
  onToggleTts: () => void;
  isTtsSupported: boolean;
  onOpenTtsSettings: () => void;
}

export function MessageInput({
  onSend,
  isListening,
  onToggleVoiceMode,
  isVoiceSupported,
  transcript,
  ttsEnabled,
  isSpeaking,
  onToggleTts,
  isTtsSupported,
  onOpenTtsSettings,
}: MessageInputProps) {
  const [input, setInput] = useState("");

  function handleSubmit(e?: FormEvent) {
    e?.preventDefault();
    const trimmed = input.trim();
    if (!trimmed) return;
    onSend(trimmed);
    setInput("");
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  }

  const displayValue = isListening && transcript ? transcript : input;

  return (
    <form onSubmit={handleSubmit} className="flex gap-3 p-4 border-t border-zinc-200 dark:border-zinc-700">
      <textarea
        value={displayValue}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="メッセージを入力..."
        rows={1}
        className="flex-1 rounded-lg border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 px-4 py-2 text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
      />
      {isTtsSupported && (
        <>
          <button
            type="button"
            onClick={onToggleTts}
            aria-label={
              isSpeaking
                ? "読み上げを停止"
                : ttsEnabled
                  ? "読み上げをOFF"
                  : "読み上げをON"
            }
            className={`rounded-lg px-3 py-2 transition-colors self-end ${
              isSpeaking
                ? "bg-green-500 text-white hover:bg-green-600"
                : ttsEnabled
                  ? "bg-blue-500 text-white hover:bg-blue-600"
                  : "bg-zinc-200 dark:bg-zinc-700 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-300 dark:hover:bg-zinc-600"
            }`}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="currentColor"
              className="w-5 h-5"
            >
              <path d="M11.383 3.07A1 1 0 0 1 12 4v16a1 1 0 0 1-1.617.784L5.535 17H3a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1h2.535l4.848-3.784A1 1 0 0 1 11.383 3.07ZM14.657 7.757a1 1 0 0 1 1.414 0A5.98 5.98 0 0 1 17.828 12a5.98 5.98 0 0 1-1.757 4.243 1 1 0 0 1-1.414-1.414A3.98 3.98 0 0 0 15.828 12a3.98 3.98 0 0 0-1.171-2.829 1 1 0 0 1 0-1.414ZM18.192 4.636a1 1 0 0 1 1.414 0A11.95 11.95 0 0 1 23.114 12a11.95 11.95 0 0 1-3.508 7.364 1 1 0 0 1-1.414-1.414A9.95 9.95 0 0 0 21.114 12a9.95 9.95 0 0 0-2.922-6.95 1 1 0 0 1 0-1.414Z" />
            </svg>
          </button>
          <button
            type="button"
            onClick={onOpenTtsSettings}
            aria-label="TTS設定"
            className="rounded-lg px-3 py-2 transition-colors self-end bg-zinc-200 dark:bg-zinc-700 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-300 dark:hover:bg-zinc-600"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="currentColor"
              className="w-5 h-5"
            >
              <path
                fillRule="evenodd"
                d="M11.078 2.25c-.917 0-1.699.663-1.85 1.567L9.05 4.889c-.02.12-.115.26-.297.348a7.493 7.493 0 0 0-.986.57c-.166.115-.334.126-.45.083L6.3 5.508a1.875 1.875 0 0 0-2.282.819l-.922 1.597a1.875 1.875 0 0 0 .432 2.385l.84.692c.095.078.17.229.154.43a7.598 7.598 0 0 0 0 1.139c.015.2-.059.352-.153.43l-.841.692a1.875 1.875 0 0 0-.432 2.385l.922 1.597a1.875 1.875 0 0 0 2.282.818l1.019-.382c.115-.043.283-.031.45.082.312.214.641.405.985.57.182.088.277.228.297.35l.178 1.071c.151.904.933 1.567 1.85 1.567h1.844c.916 0 1.699-.663 1.85-1.567l.178-1.072c.02-.12.114-.26.297-.349.344-.165.673-.356.985-.57.167-.114.335-.125.45-.082l1.02.382a1.875 1.875 0 0 0 2.28-.819l.923-1.597a1.875 1.875 0 0 0-.432-2.385l-.84-.692c-.095-.078-.17-.229-.154-.43a7.614 7.614 0 0 0 0-1.139c-.016-.2.059-.352.153-.43l.84-.692c.708-.582.891-1.59.433-2.385l-.922-1.597a1.875 1.875 0 0 0-2.282-.818l-1.02.382c-.114.043-.282.031-.449-.083a7.49 7.49 0 0 0-.985-.57c-.183-.087-.277-.227-.297-.348l-.179-1.072a1.875 1.875 0 0 0-1.85-1.567h-1.843ZM12 15.75a3.75 3.75 0 1 0 0-7.5 3.75 3.75 0 0 0 0 7.5Z"
                clipRule="evenodd"
              />
            </svg>
          </button>
        </>
      )}
      {isVoiceSupported && (
        <button
          type="button"
          onClick={onToggleVoiceMode}
          aria-label={isListening ? "音声入力を停止" : "音声入力を開始"}
          className={`rounded-lg px-3 py-2 transition-colors self-end ${
            isListening
              ? "bg-red-500 text-white hover:bg-red-600"
              : "bg-zinc-200 dark:bg-zinc-700 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-300 dark:hover:bg-zinc-600"
          }`}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="currentColor"
            className="w-5 h-5"
          >
            <path d="M12 14a3 3 0 0 0 3-3V5a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3Z" />
            <path d="M19 11a1 1 0 1 0-2 0 5 5 0 0 1-10 0 1 1 0 1 0-2 0 7 7 0 0 0 6 6.93V20H8a1 1 0 1 0 0 2h8a1 1 0 1 0 0-2h-3v-2.07A7 7 0 0 0 19 11Z" />
          </svg>
        </button>
      )}
      <button
        type="submit"
        disabled={!input.trim()}
        className="rounded-lg bg-blue-600 px-6 py-2 text-white font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors self-end"
      >
        送信 (Shift+ENTER)
      </button>
    </form>
  );
}
