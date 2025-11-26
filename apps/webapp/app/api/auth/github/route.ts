import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import crypto from "crypto";
import { getBaseUrl } from "../utils";

export async function GET(request: NextRequest) {
  const baseUrl = getBaseUrl(request);
  const cookieStore = await cookies();
  const state = crypto.randomBytes(32).toString("base64url");
  
  cookieStore.set("oauthState", state, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", maxAge: 600 });
  cookieStore.set("oauthProvider", "github", { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", maxAge: 600 });
  
  const redirectUri = encodeURIComponent(
    `${baseUrl}/api/auth/github/callback`
  );
  const scope = encodeURIComponent("user:email");
  const clientId = process.env.GITHUB_CLIENT_ID!;
  const authUrl = `https://github.com/login/oauth/authorize?client_id=${clientId}&redirect_uri=${redirectUri}&scope=${scope}&state=${state}`;
  
  return NextResponse.redirect(authUrl);
}

