import { useState, useCallback } from "react";
import type { PendingPermission } from "@/types/chat";

const PERMISSION_API_ENDPOINT = "/api/chat/permission";

interface UsePermissionReturn {
  pendingPermission: PendingPermission | null;
  setPendingPermission: (permission: PendingPermission | null) => void;
  handlePermissionResponse: (allow: boolean, alwaysAllow?: boolean) => Promise<void>;
}

export function usePermission(): UsePermissionReturn {
  const [pendingPermission, setPendingPermission] =
    useState<PendingPermission | null>(null);

  const handlePermissionResponse = useCallback(
    async (allow: boolean, alwaysAllow?: boolean) => {
      if (!pendingPermission) return;

      const saved = pendingPermission;
      setPendingPermission(null);

      try {
        const response = await fetch(PERMISSION_API_ENDPOINT, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ requestId: saved.requestId, allow, alwaysAllow }),
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
      } catch (err) {
        console.error("Permission response failed:", err);
        setPendingPermission(saved);
      }
    },
    [pendingPermission]
  );

  return { pendingPermission, setPendingPermission, handlePermissionResponse };
}
