"use client";

import { useState } from "react";
import type { PendingPermission } from "@/types/chat";

interface PermissionDialogProps {
  pendingPermission: PendingPermission;
  onRespond: (allow: boolean, alwaysAllow?: boolean) => void;
}

const TOOL_PRIMARY_FIELDS: Record<string, string> = {
  Bash: "command",
  Write: "file_path",
  Edit: "file_path",
  Read: "file_path",
};

function getPrimaryField(
  toolName: string,
  input: Record<string, unknown>
): { label: string; value: string } | null {
  const fieldName = TOOL_PRIMARY_FIELDS[toolName];
  if (!fieldName) return null;

  const value = input[fieldName];
  if (typeof value !== "string") return null;

  return { label: fieldName, value };
}

export function PermissionDialog({
  pendingPermission,
  onRespond,
}: PermissionDialogProps) {
  const [detailsOpen, setDetailsOpen] = useState(false);

  const primary = getPrimaryField(
    pendingPermission.toolName,
    pendingPermission.input
  );

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div
        className="bg-white dark:bg-zinc-800 rounded-lg p-6 max-w-lg w-full mx-4 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100 mb-4">
          権限リクエスト: {pendingPermission.toolName}
        </h2>

        {pendingPermission.description && (
          <p className="text-sm text-zinc-600 dark:text-zinc-400 mb-3">
            {pendingPermission.description}
          </p>
        )}

        {primary && (
          <div className="mb-3">
            <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
              {primary.label}
            </span>
            <pre className="mt-1 p-2 bg-zinc-100 dark:bg-zinc-900 rounded text-sm text-zinc-800 dark:text-zinc-200 overflow-x-auto whitespace-pre-wrap break-all">
              {primary.value}
            </pre>
          </div>
        )}

        <details
          open={detailsOpen}
          onToggle={(e) =>
            setDetailsOpen((e.target as HTMLDetailsElement).open)
          }
        >
          <summary className="text-xs text-zinc-500 dark:text-zinc-400 cursor-pointer hover:text-zinc-700 dark:hover:text-zinc-300 mb-2">
            詳細を{detailsOpen ? "閉じる" : "表示"}
          </summary>
          <pre className="p-2 bg-zinc-100 dark:bg-zinc-900 rounded text-xs text-zinc-700 dark:text-zinc-300 overflow-x-auto max-h-48 whitespace-pre-wrap break-all">
            {JSON.stringify(pendingPermission.input, null, 2)}
          </pre>
        </details>

        <div className="flex gap-3 mt-4 justify-end">
          <button
            onClick={() => onRespond(false)}
            className="px-4 py-2 text-sm font-medium text-zinc-700 dark:text-zinc-300 bg-zinc-200 dark:bg-zinc-700 rounded-md hover:bg-zinc-300 dark:hover:bg-zinc-600 transition-colors"
          >
            拒否
          </button>
          <button
            onClick={() => onRespond(true, false)}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 transition-colors"
          >
            許可
          </button>
          <button
            onClick={() => onRespond(true, true)}
            className="px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-md hover:bg-green-700 transition-colors"
          >
            常に許可
          </button>
        </div>
      </div>
    </div>
  );
}
