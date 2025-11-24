import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { TeamMember } from "@knowledgeplane/db/next";

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
    const { teamId } = body;

    if (!teamId) {
      return NextResponse.json(
        { error: "Team ID is required" },
        { status: 400 },
      );
    }

    // Validate that user is a member of this team
    const member = await TeamMember.findByTeamAndUser(teamId, userId);
    if (!member) {
      return NextResponse.json(
        { error: "You are not a member of this team" },
        { status: 403 },
      );
    }

    // Set teamId cookie
    cookieStore.set("teamId", teamId, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 7, // 7 days
    });

    return NextResponse.json({ success: true, teamId });
  } catch (error: any) {
    console.error("Switch team error:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 },
    );
  }
}

