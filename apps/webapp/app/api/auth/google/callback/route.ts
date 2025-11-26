import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import crypto from "crypto";
import { User, Team, TeamMember } from "@knowledgeplane/db/next";
import { getBaseUrl } from "../../utils";

export async function GET(request: NextRequest) {
  const baseUrl = getBaseUrl(request);
  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const error = searchParams.get("error");

  if (error) {
    return NextResponse.redirect(
      new URL(`/auth/google?error=${error}`, baseUrl),
    );
  }

  if (!code) {
    return NextResponse.redirect(
      new URL("/auth/google?error=missing_code", baseUrl),
    );
  }

  const cookieStore = await cookies();
  const storedState = cookieStore.get("oauthState")?.value;

  if (!state || state !== storedState) {
    return NextResponse.redirect(
      new URL("/auth/google?error=invalid_state", baseUrl),
    );
  }

  cookieStore.delete("oauthState");
  cookieStore.delete("oauthProvider");

  const redirectUri = `${baseUrl}/api/auth/google/callback`;

  try {
    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        client_id: process.env.GOOGLE_CLIENT_ID!,
        client_secret: process.env.GOOGLE_CLIENT_SECRET!,
        code: code,
        grant_type: "authorization_code",
        redirect_uri: redirectUri,
      }),
    });

    if (!tokenResponse.ok) {
      return NextResponse.redirect(
        new URL("/auth/google?error=token_exchange_failed", baseUrl),
      );
    }

    const tokenData = await tokenResponse.json();
    const accessToken = tokenData.access_token;

    const userInfoResponse = await fetch(
      "https://www.googleapis.com/oauth2/v2/userinfo",
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      },
    );

    if (!userInfoResponse.ok) {
      return NextResponse.redirect(
        new URL("/auth/google?error=user_info_failed", baseUrl),
      );
    }

    const userInfo = await userInfoResponse.json();
    const email = userInfo.email;
    const username = userInfo.email?.split("@")[0] || userInfo.id;

    if (!email || !username) {
      return NextResponse.redirect(
        new URL("/auth/google?error=missing_user_info", baseUrl),
      );
    }

    const isNewUser = !(await User.findByUsername(username));
    const user = await User.getOrCreate({
      username,
      email,
    });

    // Create default team for new users
    if (isNewUser) {
      const defaultTeam = await Team.create({
        name: `${user.username}'s Team`,
        description: "Default team",
        created_by: user.id,
      });

      await TeamMember.create({
        team_id: defaultTeam.id,
        user_id: user.id,
        role: "owner",
      });
    }

    cookieStore.set("session", crypto.randomBytes(32).toString("base64url"), {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 7, // 7 days
    });
    cookieStore.set("userId", user.id, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 7,
    });

    // Redirect to onboarding if not completed
    if (!user.onboarding_completed) {
      return NextResponse.redirect(new URL("/onboarding", baseUrl));
    }

    return NextResponse.redirect(new URL("/dashboard", baseUrl));
  } catch (error: any) {
    console.error("Google OAuth callback error:", error);
    return NextResponse.redirect(
      new URL("/auth/google?error=internal_error", baseUrl),
    );
  }
}
