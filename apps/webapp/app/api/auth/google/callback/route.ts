import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import crypto from "crypto";
import { User } from "@knowledgeplane/db";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const error = searchParams.get("error");

  if (error) {
    return NextResponse.redirect(new URL(`/auth/google?error=${error}`, request.url));
  }

  if (!code) {
    return NextResponse.redirect(new URL("/auth/google?error=missing_code", request.url));
  }

  const cookieStore = await cookies();
  const storedState = cookieStore.get("oauthState")?.value;
  
  if (!state || state !== storedState) {
    return NextResponse.redirect(new URL("/auth/google?error=invalid_state", request.url));
  }

  cookieStore.delete("oauthState");
  cookieStore.delete("oauthProvider");

  const redirectUri = `${process.env.NEXTAUTH_URL || process.env.OAUTH_REDIRECT_BASE_URL || "http://localhost:3000"}/api/auth/google/callback`;
  
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
      return NextResponse.redirect(new URL("/auth/google?error=token_exchange_failed", request.url));
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
      return NextResponse.redirect(new URL("/auth/google?error=user_info_failed", request.url));
    }

    const userInfo = await userInfoResponse.json();
    const email = userInfo.email;
    const username = userInfo.email?.split("@")[0] || userInfo.id;

    const user = await User.getOrCreate({
      username,
      email,
    });

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

    return NextResponse.redirect(new URL("/dashboard", request.url));
  } catch (error: any) {
    console.error("Google OAuth callback error:", error);
    return NextResponse.redirect(new URL("/auth/google?error=internal_error", request.url));
  }
}

