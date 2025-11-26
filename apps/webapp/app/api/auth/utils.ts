import { NextRequest } from "next/server";

/**
 * Gets the base URL for redirects, handling Docker/reverse proxy environments.
 * Prioritizes OAUTH_REDIRECT_BASE_URL, then extracts from forwarded headers,
 * then falls back to request URL.
 */
export function getBaseUrl(request: NextRequest): string {
  // First, check if OAUTH_REDIRECT_BASE_URL is explicitly set
  if (process.env.OAUTH_REDIRECT_BASE_URL) {
    return process.env.OAUTH_REDIRECT_BASE_URL;
  }

  // Extract from forwarded headers (set by reverse proxies like DigitalOcean App Platform)
  const forwardedHost = request.headers.get("x-forwarded-host");
  const forwardedProto = request.headers.get("x-forwarded-proto") || "https";
  const host = request.headers.get("host");

  if (forwardedHost) {
    return `${forwardedProto}://${forwardedHost}`;
  }

  if (host && !host.includes("0.0.0.0")) {
    // Use the protocol from the request URL, defaulting to https in production
    const protocol =
      request.nextUrl.protocol ||
      (process.env.NODE_ENV === "production" ? "https" : "http");
    return `${protocol}//${host}`;
  }

  // Fallback: construct from request URL, but replace 0.0.0.0 if present
  const url = new URL(request.url);
  if (url.hostname === "0.0.0.0" && host && !host.includes("0.0.0.0")) {
    url.hostname = host.split(":")[0]; // Remove port if present
  }
  return `${url.protocol}//${url.host}`;
}
