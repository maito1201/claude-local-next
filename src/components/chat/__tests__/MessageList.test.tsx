import { render, screen } from "@testing-library/react";
import { MessageList } from "../MessageList";
import type { ChatMessage } from "@/types/chat";

describe("MessageList", () => {
  test("should show placeholder when messages are empty", () => {
    render(<MessageList messages={[]} />);

    expect(screen.getByText("メッセージを送信してください")).toBeInTheDocument();
  });

  test("should render user messages", () => {
    const messages: ChatMessage[] = [
      { id: "1", role: "user", content: "Hello" },
    ];
    render(<MessageList messages={messages} />);

    expect(screen.getByText("Hello")).toBeInTheDocument();
  });

  test("should render assistant messages", () => {
    const messages: ChatMessage[] = [
      { id: "1", role: "assistant", content: "Hi there!" },
    ];
    render(<MessageList messages={messages} />);

    expect(screen.getByText("Hi there!")).toBeInTheDocument();
  });

  test("should render multiple messages in order", () => {
    const messages: ChatMessage[] = [
      { id: "1", role: "user", content: "First" },
      { id: "2", role: "assistant", content: "Second" },
      { id: "3", role: "user", content: "Third" },
    ];
    render(<MessageList messages={messages} />);

    expect(screen.getByText("First")).toBeInTheDocument();
    expect(screen.getByText("Second")).toBeInTheDocument();
    expect(screen.getByText("Third")).toBeInTheDocument();
  });

  test("should apply different styles for user and assistant messages", () => {
    const messages: ChatMessage[] = [
      { id: "1", role: "user", content: "User message" },
      { id: "2", role: "assistant", content: "Assistant message" },
    ];
    render(<MessageList messages={messages} />);

    const userBubble = screen.getByText("User message");
    const assistantBubble = screen.getByText("Assistant message");

    expect(userBubble.className).toContain("bg-blue-600");
    expect(assistantBubble.className).toContain("bg-zinc-100");
  });
});
