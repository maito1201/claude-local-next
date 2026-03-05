import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MessageInput } from "../MessageInput";

function renderMessageInput(overrides: {
  onSend?: jest.Mock;
  voiceMode?: boolean;
  onToggleVoiceMode?: jest.Mock;
  isVoiceSupported?: boolean;
  transcript?: string;
  ttsEnabled?: boolean;
  isSpeaking?: boolean;
  onToggleTts?: jest.Mock;
  isTtsSupported?: boolean;
  onOpenTtsSettings?: jest.Mock;
} = {}) {
  const props = {
    onSend: overrides.onSend ?? jest.fn(),
    voiceMode: overrides.voiceMode ?? false,
    onToggleVoiceMode: overrides.onToggleVoiceMode ?? jest.fn(),
    isVoiceSupported: overrides.isVoiceSupported ?? false,
    transcript: overrides.transcript ?? "",
    ttsEnabled: overrides.ttsEnabled ?? false,
    isSpeaking: overrides.isSpeaking ?? false,
    onToggleTts: overrides.onToggleTts ?? jest.fn(),
    isTtsSupported: overrides.isTtsSupported ?? false,
    onOpenTtsSettings: overrides.onOpenTtsSettings ?? jest.fn(),
  };
  return { ...render(<MessageInput {...props} />), props };
}

describe("MessageInput", () => {
  test("should render textarea and submit button", () => {
    renderMessageInput();

    expect(screen.getByPlaceholderText("メッセージを入力...")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "送信 (Shift+ENTER)" })).toBeInTheDocument();
  });

  test("should call onSend with trimmed text on submit button click", async () => {
    const user = userEvent.setup();
    const onSend = jest.fn();
    renderMessageInput({ onSend });

    const textarea = screen.getByPlaceholderText("メッセージを入力...");
    await user.type(textarea, "  Hello Claude  ");
    await user.click(screen.getByRole("button", { name: "送信 (Shift+ENTER)" }));

    expect(onSend).toHaveBeenCalledWith("Hello Claude");
  });

  test("should clear input after sending", async () => {
    const user = userEvent.setup();
    renderMessageInput();

    const textarea = screen.getByPlaceholderText("メッセージを入力...");
    await user.type(textarea, "Hello");
    await user.click(screen.getByRole("button", { name: "送信 (Shift+ENTER)" }));

    expect(textarea).toHaveValue("");
  });

  test("should not call onSend when input is empty", async () => {
    const user = userEvent.setup();
    const onSend = jest.fn();
    renderMessageInput({ onSend });

    await user.click(screen.getByRole("button", { name: "送信 (Shift+ENTER)" }));

    expect(onSend).not.toHaveBeenCalled();
  });

  test("should not call onSend when input is whitespace only", async () => {
    const user = userEvent.setup();
    const onSend = jest.fn();
    renderMessageInput({ onSend });

    const textarea = screen.getByPlaceholderText("メッセージを入力...");
    await user.type(textarea, "   ");
    await user.click(screen.getByRole("button", { name: "送信 (Shift+ENTER)" }));

    expect(onSend).not.toHaveBeenCalled();
  });

  test("should send message on Shift+Enter", async () => {
    const onSend = jest.fn();
    renderMessageInput({ onSend });

    const textarea = screen.getByPlaceholderText("メッセージを入力...");
    fireEvent.change(textarea, { target: { value: "Hello" } });
    fireEvent.keyDown(textarea, { key: "Enter", shiftKey: true });

    expect(onSend).toHaveBeenCalledWith("Hello");
  });

  test("should not send message on Enter without Shift", async () => {
    const onSend = jest.fn();
    renderMessageInput({ onSend });

    const textarea = screen.getByPlaceholderText("メッセージを入力...");
    fireEvent.change(textarea, { target: { value: "Hello" } });
    fireEvent.keyDown(textarea, { key: "Enter", shiftKey: false });

    expect(onSend).not.toHaveBeenCalled();
  });

  test("should not show voice button when isVoiceSupported is false", () => {
    renderMessageInput({ isVoiceSupported: false });

    expect(
      screen.queryByRole("button", { name: /音声入力/ })
    ).not.toBeInTheDocument();
  });

  test("should show voice button when isVoiceSupported is true", () => {
    renderMessageInput({ isVoiceSupported: true });

    expect(
      screen.getByRole("button", { name: "音声入力を開始" })
    ).toBeInTheDocument();
  });

  test("should call onToggleVoiceMode when voice button is clicked", async () => {
    const user = userEvent.setup();
    const onToggleVoiceMode = jest.fn();
    renderMessageInput({ isVoiceSupported: true, onToggleVoiceMode });

    await user.click(
      screen.getByRole("button", { name: "音声入力を開始" })
    );

    expect(onToggleVoiceMode).toHaveBeenCalledTimes(1);
  });

  test("should show stop label when voiceMode is true", () => {
    renderMessageInput({ isVoiceSupported: true, voiceMode: true });

    expect(
      screen.getByRole("button", { name: "音声入力を停止" })
    ).toBeInTheDocument();
  });

  test("should display transcript in textarea when voiceMode is on", () => {
    renderMessageInput({
      isVoiceSupported: true,
      voiceMode: true,
      transcript: "音声テキスト",
    });

    const textarea = screen.getByPlaceholderText("メッセージを入力...");
    expect(textarea).toHaveValue("音声テキスト");
  });

  test("should not show TTS button when isTtsSupported is false", () => {
    renderMessageInput({ isTtsSupported: false });

    expect(
      screen.queryByRole("button", { name: /読み上げ/ })
    ).not.toBeInTheDocument();
  });

  test("should show TTS button when isTtsSupported is true", () => {
    renderMessageInput({ isTtsSupported: true });

    expect(
      screen.getByRole("button", { name: "読み上げをON" })
    ).toBeInTheDocument();
  });

  test("should call onToggleTts when TTS button is clicked", async () => {
    const user = userEvent.setup();
    const onToggleTts = jest.fn();
    renderMessageInput({ isTtsSupported: true, onToggleTts });

    await user.click(
      screen.getByRole("button", { name: "読み上げをON" })
    );

    expect(onToggleTts).toHaveBeenCalledTimes(1);
  });

  test("should show OFF label when ttsEnabled is true", () => {
    renderMessageInput({ isTtsSupported: true, ttsEnabled: true });

    expect(
      screen.getByRole("button", { name: "読み上げをOFF" })
    ).toBeInTheDocument();
  });

  test("should show stop label when isSpeaking is true", () => {
    renderMessageInput({
      isTtsSupported: true,
      ttsEnabled: true,
      isSpeaking: true,
    });

    expect(
      screen.getByRole("button", { name: "読み上げを停止" })
    ).toBeInTheDocument();
  });

  test("should show TTS settings button when isTtsSupported is true", () => {
    renderMessageInput({ isTtsSupported: true });

    expect(
      screen.getByRole("button", { name: "TTS設定" })
    ).toBeInTheDocument();
  });

  test("should not show TTS settings button when isTtsSupported is false", () => {
    renderMessageInput({ isTtsSupported: false });

    expect(
      screen.queryByRole("button", { name: "TTS設定" })
    ).not.toBeInTheDocument();
  });

  test("should call onOpenTtsSettings when settings button is clicked", async () => {
    const user = userEvent.setup();
    const onOpenTtsSettings = jest.fn();
    renderMessageInput({ isTtsSupported: true, onOpenTtsSettings });

    await user.click(
      screen.getByRole("button", { name: "TTS設定" })
    );

    expect(onOpenTtsSettings).toHaveBeenCalledTimes(1);
  });
});
