import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PermissionDialog } from "../PermissionDialog";
import type { PendingPermission } from "@/types/chat";

describe("PermissionDialog", () => {
  const bashPermission: PendingPermission = {
    requestId: "req-1",
    toolName: "Bash",
    input: { command: "rm -rf /tmp/test", description: "Delete temp files" },
    description: "Execute a shell command",
  };

  test("should display tool name in heading", () => {
    render(
      <PermissionDialog
        pendingPermission={bashPermission}
        onRespond={jest.fn()}
      />
    );

    expect(
      screen.getByText("権限リクエスト: Bash")
    ).toBeInTheDocument();
  });

  test("should display description when provided", () => {
    render(
      <PermissionDialog
        pendingPermission={bashPermission}
        onRespond={jest.fn()}
      />
    );

    expect(
      screen.getByText("Execute a shell command")
    ).toBeInTheDocument();
  });

  test("should display primary field for Bash tool", () => {
    render(
      <PermissionDialog
        pendingPermission={bashPermission}
        onRespond={jest.fn()}
      />
    );

    expect(screen.getByText("command")).toBeInTheDocument();
    expect(screen.getByText("rm -rf /tmp/test")).toBeInTheDocument();
  });

  test("should display primary field for Write tool", () => {
    const writePermission: PendingPermission = {
      requestId: "req-2",
      toolName: "Write",
      input: { file_path: "/src/app.ts", content: "export {}" },
    };

    render(
      <PermissionDialog
        pendingPermission={writePermission}
        onRespond={jest.fn()}
      />
    );

    expect(screen.getByText("file_path")).toBeInTheDocument();
    expect(screen.getByText("/src/app.ts")).toBeInTheDocument();
  });

  test("should not display primary field for unknown tools", () => {
    const unknownPermission: PendingPermission = {
      requestId: "req-3",
      toolName: "CustomTool",
      input: { data: "value" },
    };

    render(
      <PermissionDialog
        pendingPermission={unknownPermission}
        onRespond={jest.fn()}
      />
    );

    expect(screen.queryByText("data")).not.toBeInTheDocument();
  });

  test("should call onRespond with (true, false) when allow is clicked", async () => {
    const user = userEvent.setup();
    const onRespond = jest.fn();

    render(
      <PermissionDialog
        pendingPermission={bashPermission}
        onRespond={onRespond}
      />
    );

    await user.click(screen.getByRole("button", { name: "許可" }));

    expect(onRespond).toHaveBeenCalledWith(true, false);
  });

  test("should call onRespond with (true, true) when always allow is clicked", async () => {
    const user = userEvent.setup();
    const onRespond = jest.fn();

    render(
      <PermissionDialog
        pendingPermission={bashPermission}
        onRespond={onRespond}
      />
    );

    await user.click(screen.getByRole("button", { name: "常に許可" }));

    expect(onRespond).toHaveBeenCalledWith(true, true);
  });

  test("should call onRespond with false when deny is clicked", async () => {
    const user = userEvent.setup();
    const onRespond = jest.fn();

    render(
      <PermissionDialog
        pendingPermission={bashPermission}
        onRespond={onRespond}
      />
    );

    await user.click(screen.getByRole("button", { name: "拒否" }));

    expect(onRespond).toHaveBeenCalledWith(false);
  });

  test("should not display description when not provided", () => {
    const noDescPermission: PendingPermission = {
      requestId: "req-4",
      toolName: "Bash",
      input: { command: "echo hi" },
    };

    render(
      <PermissionDialog
        pendingPermission={noDescPermission}
        onRespond={jest.fn()}
      />
    );

    expect(
      screen.queryByText("Execute a shell command")
    ).not.toBeInTheDocument();
  });
});
