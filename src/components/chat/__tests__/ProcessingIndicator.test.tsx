import { render, screen } from "@testing-library/react";
import { ProcessingIndicator } from "../ProcessingIndicator";

describe("ProcessingIndicator", () => {
  test("should show processing text", () => {
    render(<ProcessingIndicator processingState={{ type: "processing" }} />);

    expect(screen.getByText("Processing...")).toBeInTheDocument();
  });

  test("should show thinking text", () => {
    render(<ProcessingIndicator processingState={{ type: "thinking" }} />);

    expect(screen.getByText("Thinking...")).toBeInTheDocument();
  });

  test("should show tool use text with tool name", () => {
    render(
      <ProcessingIndicator
        processingState={{ type: "tool_use", toolName: "Bash" }}
      />
    );

    expect(screen.getByText("Using tool: Bash...")).toBeInTheDocument();
  });

  test("should apply pulse style classes", () => {
    render(<ProcessingIndicator processingState={{ type: "processing" }} />);

    const indicator = screen.getByText("Processing...");
    expect(indicator.className).toContain("animate-pulse");
    expect(indicator.className).toContain("text-zinc-400");
  });
});
