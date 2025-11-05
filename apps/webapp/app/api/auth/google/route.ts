import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import crypto from "crypto";
import { User } from "@knowledgeplane/db";

export async function GET(request: NextRequest) {
  const cookieStore = await cookies();
  const state = crypto.randomBytes(32).toString("base64url");
  
  cookieStore.set("oauthState", state, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", maxAge: 600 });
  cookieStore.set("oauthProvider", "google", { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", maxAge: 600 });
  
  const redirectUri = encodeURIComponent(
    `${process.env.NEXTAUTH_URL || process.env.OAUTH_REDIRECT_BASE_URL || "http://localhost:3000"}/api/auth/google/callback`
  );
  const scope = encodeURIComponent("openid email profile");
  const clientId = process.env.GOOGLE_CLIENT_ID!;
  const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}&redirect_uri=${redirectUri}&response_type=code&scope=${scope}&state=${state}&access_type=offline&prompt=consent`;
  
  return NextResponse.redirect(authUrl);
}

