import { NextRequest, NextResponse } from "next/server";
import { workspaceRequest } from "@/lib/workspace-server";

export const runtime = "nodejs";
export async function GET(request: NextRequest) {
  return workspaceRequest(request, { action: "session" });
}
export async function POST(request: NextRequest) {
  if (request.headers.get("origin") !== request.nextUrl.origin) {
    return NextResponse.json({ error: "ORIGIN_DENIED" }, { status: 403 });
  }
  const body = await request.json().catch(() => null);
  if (!body || !["list_members", "save_member", "revoke_member", "activity"].includes(body.action)) {
    return NextResponse.json({ error: "INVALID_ACTION" }, { status: 400 });
  }
  return workspaceRequest(request, body);
}
