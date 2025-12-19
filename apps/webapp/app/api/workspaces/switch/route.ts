import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { WorkspaceMember } from "@knowledgeplane/db/next";

export async function POST(request: NextRequest) {
  try {
    const cookieStore = await cookies();
    const userId = cookieStore.get("userId")?.value;
    const sessionId = cookieStore.get("session")?.value;

    if (!sessionId || !userId) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 },
      );
    }

    const body = await request.json();
    const { workspaceId } = body;

    if (!workspaceId) {
      return NextResponse.json(
        { error: "Workspace ID is required" },
        { status: 400 },
      );
    }

    // Validate that user is a member of this workspace
    const member = await WorkspaceMember.findByWorkspaceAndUser(workspaceId, userId);
    if (!member) {
      return NextResponse.json(
        { error: "You are not a member of this workspace" },
        { status: 403 },
      );
    }

    // Set workspaceId cookie
    cookieStore.set("workspaceId", workspaceId, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 7, // 7 days
    });

    return NextResponse.json({ success: true, workspaceId });
  } catch (error: any) {
    console.error("Switch workspace error:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 },
    );
  }
}
