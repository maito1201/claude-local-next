type MessageRole = "user" | "assistant";

export interface ChatMessage {
  id: string;
  role: MessageRole;
  content: string;
}

export type SSEChunk =
  | { type: "text_delta"; text: string }
  | { type: "result" }
  | { type: "error"; error: string }
  | {
      type: "permission_request";
      requestId: string;
      toolName: string;
      input: Record<string, unknown>;
      description?: string;
    };

export interface ClaudeStdinMessage {
  type: "user";
  session_id: "";
  message: {
    role: "user";
    content: Array<{ type: "text"; text: string }>;
  };
  parent_tool_use_id: null;
}

export interface PermissionRule {
  toolName: string;
  ruleContent?: string;
}

export interface PermissionUpdate {
  type: "addRules";
  rules: PermissionRule[];
  behavior: "allow" | "deny" | "ask";
  destination: "session";
}

export type ControlResponseBehavior =
  | {
      behavior: "allow";
      updatedInput: Record<string, unknown>;
      updatedPermissions?: PermissionUpdate[];
    }
  | { behavior: "deny"; message: string }
  | null;

export interface ClaudeControlResponse {
  type: "control_response";
  response: {
    subtype: "success";
    request_id: string;
    response: ControlResponseBehavior;
  };
}

export interface PendingPermission {
  requestId: string;
  toolName: string;
  input: Record<string, unknown>;
  description?: string;
}

export interface PermissionResponseBody {
  requestId: string;
  allow: boolean;
  alwaysAllow?: boolean;
  message?: string;
}
