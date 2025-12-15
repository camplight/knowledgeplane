import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import crypto from "crypto";
import { User } from "@knowledgeplane/db/next";
import { getBaseUrl } from "../utils";

export async function GET(request: NextRequest) {
  const baseUrl = getBaseUrl(request);
  const cookieStore = await cookies();
  const state = crypto.randomBytes(32).toString("base64url");
  
  // Store redirect parameter if present (e.g., from invite link)
  const redirectParam = request.nextUrl.searchParams.get("redirect");
  if (redirectParam) {
    cookieStore.set("oauthRedirect", redirectParam, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 600,
    });
  }
  
  cookieStore.set("oauthState", state, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", maxAge: 600 });
  cookieStore.set("oauthProvider", "google", { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", maxAge: 600 });
  
  const redirectUri = encodeURIComponent(
    `${baseUrl}/api/auth/google/callback`
  );
  const scope = encodeURIComponent("openid email profile");
  const clientId = process.env.GOOGLE_CLIENT_ID!;
  const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}&redirect_uri=${redirectUri}&response_type=code&scope=${scope}&state=${state}&access_type=offline&prompt=consent`;
  
  return NextResponse.redirect(authUrl);
}

