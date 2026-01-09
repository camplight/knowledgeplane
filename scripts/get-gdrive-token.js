#!/usr/bin/env node

/**
 * Script to generate a Google Drive read-only access token
 *
 * Usage:
 *   node scripts/get-gdrive-token.js
 *
 * Requires environment variables:
 *   GOOGLE_CLIENT_ID
 *   GOOGLE_CLIENT_SECRET
 *
 * Or pass as arguments:
 *   node scripts/get-gdrive-token.js <CLIENT_ID> <CLIENT_SECRET>
 */

import http from "http";
import https from "https";
import { exec } from "child_process";
import { URL } from "url";

const CLIENT_ID = process.argv[2] || process.env.GOOGLE_CLIENT_ID;
const CLIENT_SECRET = process.argv[3] || process.env.GOOGLE_CLIENT_SECRET;
const SCOPE = "https://www.googleapis.com/auth/drive.readonly";

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error(
    "Error: GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are required",
  );
  console.error("\nUsage:");
  console.error(
    "  node scripts/get-gdrive-token.js [CLIENT_ID] [CLIENT_SECRET]",
  );
  console.error("\nOr set environment variables:");
  console.error("  export GOOGLE_CLIENT_ID=your_client_id");
  console.error("  export GOOGLE_CLIENT_SECRET=your_client_secret");
  process.exit(1);
}

// Use fixed port for OAuth callback
const PORT = 49617;
const REDIRECT_URI = `http://localhost:${PORT}/oauth2callback`;

// Create authorization URL
const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
authUrl.searchParams.set("client_id", CLIENT_ID);
authUrl.searchParams.set("redirect_uri", REDIRECT_URI);
authUrl.searchParams.set("response_type", "code");
authUrl.searchParams.set("scope", SCOPE);
authUrl.searchParams.set("access_type", "offline");
authUrl.searchParams.set("prompt", "consent");

console.log("\n🔐 Google Drive OAuth Token Generator\n");
console.log("1. Opening browser for authorization...");
console.log(`   ${authUrl.toString()}\n`);

// Start local server to receive callback
const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const code = url.searchParams.get("code");
  const error = url.searchParams.get("error");

  if (error) {
    res.writeHead(400, { "Content-Type": "text/html" });
    res.end(`<html><body><h1>Error: ${error}</h1></body></html>`);
    server.close();
    process.exit(1);
  }

  if (code) {
    // Exchange code for token
    exchangeCodeForToken(code)
      .then((tokenData) => {
        res.writeHead(200, { "Content-Type": "text/html" });
        res.end(`
          <html>
            <body>
              <h1>✅ Success!</h1>
              <p>Check your terminal for the access token.</p>
              <p>You can close this window.</p>
            </body>
          </html>
        `);
        server.close();

        console.log("\n✅ Token generated successfully!\n");
        console.log("📋 Access Token:");
        console.log(tokenData.access_token);
        console.log("\n📋 Refresh Token (save this for future use):");
        console.log(
          tokenData.refresh_token ||
            "No refresh token (token may expire in 1 hour)",
        );
        console.log(
          "\n💡 To use this token, add it to your data source secrets as:",
        );
        console.log("   Key: googleAccessToken");
        console.log(`   Value: ${tokenData.access_token}\n`);

        if (tokenData.refresh_token) {
          console.log("💡 To refresh this token later, use:");
          console.log(`   curl -X POST https://oauth2.googleapis.com/token \\`);
          console.log(`     -d "client_id=${CLIENT_ID}" \\`);
          console.log(`     -d "client_secret=${CLIENT_SECRET}" \\`);
          console.log(`     -d "refresh_token=${tokenData.refresh_token}" \\`);
          console.log(`     -d "grant_type=refresh_token"\n`);
        }

        process.exit(0);
      })
      .catch((err) => {
        res.writeHead(500, { "Content-Type": "text/html" });
        res.end(`<html><body><h1>Error: ${err.message}</h1></body></html>`);
        server.close();
        console.error("\n❌ Error:", err.message);
        process.exit(1);
      });
  } else {
    res.writeHead(400, { "Content-Type": "text/html" });
    res.end(
      "<html><body><h1>No authorization code received</h1></body></html>",
    );
  }
});

server.listen(PORT, () => {
  // Open browser
  const platform = process.platform;
  let command;

  if (platform === "darwin") {
    command = `open "${authUrl.toString()}"`;
  } else if (platform === "win32") {
    command = `start "${authUrl.toString()}"`;
  } else {
    command = `xdg-open "${authUrl.toString()}"`;
  }

  exec(command, (error) => {
    if (error) {
      console.log("⚠️  Could not open browser automatically.");
      console.log("   Please open the URL above manually.\n");
    }
  });

  console.log(
    `2. Waiting for authorization callback on http://localhost:${PORT}/oauth2callback`,
  );
  console.log(
    "   (This server will close automatically after receiving the token)\n",
  );
});

function exchangeCodeForToken(code) {
  return new Promise((resolve, reject) => {
    const body = new URLSearchParams({
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      code: code,
      grant_type: "authorization_code",
      redirect_uri: REDIRECT_URI,
    });

    const options = {
      hostname: "oauth2.googleapis.com",
      path: "/token",
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Content-Length": Buffer.byteLength(body.toString()),
      },
    };

    const req = https.request(options, (res) => {
      let data = "";

      res.on("data", (chunk) => {
        data += chunk;
      });

      res.on("end", () => {
        if (res.statusCode !== 200) {
          reject(
            new Error(`Token exchange failed: ${res.statusCode} - ${data}`),
          );
          return;
        }

        try {
          resolve(JSON.parse(data));
        } catch (err) {
          reject(new Error(`Failed to parse response: ${err.message}`));
        }
      });
    });

    req.on("error", (err) => {
      reject(new Error(`Request failed: ${err.message}`));
    });

    req.write(body.toString());
    req.end();
  });
}
