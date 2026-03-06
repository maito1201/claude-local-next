import { NextRequest } from "next/server";

jest.mock("@/lib/claude-process", () => ({
  respondToPermission: jest.fn(),
}));

import { POST } from "../route";
import { respondToPermission } from "@/lib/claude-process";

const mockRespondToPermission = respondToPermission as jest.MockedFunction<
  typeof respondToPermission
>;

function createRequest(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/chat/permission", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/chat/permission", () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  test("should return 400 when requestId is missing", async () => {
    const request = createRequest({ allow: true });
    const response = await POST(request);

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBe("requestId is required");
  });

  test("should return 400 when requestId is not a string", async () => {
    const request = createRequest({ requestId: 123, allow: true });
    const response = await POST(request);

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBe("requestId is required");
  });

  test("should return 400 when allow is missing", async () => {
    const request = createRequest({ requestId: "req-1" });
    const response = await POST(request);

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBe("allow field is required");
  });

  test("should call respondToPermission with allow=true", async () => {
    const request = createRequest({ requestId: "req-1", allow: true });
    const response = await POST(request);

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.ok).toBe(true);
    expect(mockRespondToPermission).toHaveBeenCalledWith(
      "req-1",
      true,
      { message: undefined, alwaysAllow: undefined }
    );
  });

  test("should call respondToPermission with allow=false and message", async () => {
    const request = createRequest({
      requestId: "req-2",
      allow: false,
      message: "No thanks",
    });
    const response = await POST(request);

    expect(response.status).toBe(200);
    expect(mockRespondToPermission).toHaveBeenCalledWith(
      "req-2",
      false,
      { message: "No thanks", alwaysAllow: undefined }
    );
  });

  test("should call respondToPermission with alwaysAllow=true", async () => {
    const request = createRequest({
      requestId: "req-3",
      allow: true,
      alwaysAllow: true,
    });
    const response = await POST(request);

    expect(response.status).toBe(200);
    expect(mockRespondToPermission).toHaveBeenCalledWith(
      "req-3",
      true,
      { message: undefined, alwaysAllow: true }
    );
  });

  test("should return 500 when respondToPermission throws", async () => {
    mockRespondToPermission.mockImplementation(() => {
      throw new Error("No pending permission request: req-unknown");
    });

    const request = createRequest({ requestId: "req-unknown", allow: true });
    const response = await POST(request);

    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body.error).toBe("No pending permission request: req-unknown");
  });
});
