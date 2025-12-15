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
    return NextResponse.redirect(new URL(`/auth/github?error=${error}`, baseUrl));
  }

  if (!code) {
    return NextResponse.redirect(new URL("/auth/github?error=missing_code", baseUrl));
  }

  const cookieStore = await cookies();
  const storedState = cookieStore.get("oauthState")?.value;
  
  if (!state || state !== storedState) {
    return NextResponse.redirect(new URL("/auth/github?error=invalid_state", baseUrl));
  }

  cookieStore.delete("oauthState");
  cookieStore.delete("oauthProvider");
  
  // Get redirect parameter if stored (e.g., from invite link)
  const redirectPath = cookieStore.get("oauthRedirect")?.value;
  if (redirectPath) {
    cookieStore.delete("oauthRedirect");
  }

  const redirectUri = `${baseUrl}/api/auth/github/callback`;
  
  try {
    const tokenResponse = await fetch("https://github.com/login/oauth/access_token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body: new URLSearchParams({
        client_id: process.env.GITHUB_CLIENT_ID!,
        client_secret: process.env.GITHUB_CLIENT_SECRET!,
        code: code,
        redirect_uri: redirectUri,
      }),
    });

    if (!tokenResponse.ok) {
      return NextResponse.redirect(new URL("/auth/github?error=token_exchange_failed", baseUrl));
    }

    const tokenData = await tokenResponse.json();
    const accessToken = tokenData.access_token;

    if (!accessToken) {
      return NextResponse.redirect(new URL("/auth/github?error=no_token", baseUrl));
    }

    const userInfoResponse = await fetch("https://api.github.com/user", {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/vnd.github.v3+json",
      },
    });

    if (!userInfoResponse.ok) {
      return NextResponse.redirect(new URL("/auth/github?error=user_info_failed", baseUrl));
    }

    const userInfo = await userInfoResponse.json();

    let email = userInfo.email;
    if (!email) {
      const emailsResponse = await fetch("https://api.github.com/user/emails", {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: "application/vnd.github.v3+json",
        },
      });
      if (emailsResponse.ok) {
        const emails = await emailsResponse.json();
        const primaryEmail = emails.find((e: any) => e.primary);
        email = primaryEmail?.email || emails[0]?.email;
      }
    }

    if (!email) {
      return NextResponse.redirect(new URL("/auth/github?error=no_email", baseUrl));
    }

    const username = userInfo.login || userInfo.id?.toString();

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
      maxAge: 60 * 60 * 24 * 7,
    });
    cookieStore.set("userId", user.id, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 7,
    });

    // Use stored redirect path if available (e.g., invite link)
    if (redirectPath) {
      return NextResponse.redirect(new URL(redirectPath, baseUrl));
    }

    // Redirect to onboarding if not completed
    if (!user.onboarding_completed) {
      return NextResponse.redirect(new URL("/onboarding", baseUrl));
    }

    return NextResponse.redirect(new URL("/dashboard", baseUrl));
  } catch (error: any) {
    console.error("GitHub OAuth callback error:", error);
    return NextResponse.redirect(new URL("/auth/github?error=internal_error", baseUrl));
  }
}

