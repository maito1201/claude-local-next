import type { ProcessingState } from "@/types/chat";

interface ProcessingIndicatorProps {
  processingState: Exclude<ProcessingState, null>;
}

function getProcessingText(state: Exclude<ProcessingState, null>): string {
  if (state.type === "processing") {
    return "Processing...";
  }
  if (state.type === "thinking") {
    return "Thinking...";
  }
  return `Using tool: ${state.toolName}...`;
}

export function ProcessingIndicator({ processingState }: ProcessingIndicatorProps) {
  return (
    <div className="flex justify-start">
      <p className="px-1 text-sm text-zinc-400 dark:text-zinc-500 animate-pulse">
        {getProcessingText(processingState)}
      </p>
    </div>
  );
}
