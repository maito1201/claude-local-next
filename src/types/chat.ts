type MessageRole = "user" | "assistant";

export interface ChatMessage {
  id: string;
  role: MessageRole;
  content: string;
}

export interface SSEChunk {
  type: "text_delta" | "result" | "error";
  text?: string;
  error?: string;
}

export interface ClaudeStdinMessage {
  type: "user";
  session_id: "";
  message: {
    role: "user";
    content: Array<{ type: "text"; text: string }>;
  };
  parent_tool_use_id: null;
}

export interface ClaudeControlResponse {
  type: "control_response";
  response: {
    subtype: "success";
    request_id: string;
    response: null;
  };
}
