import crypto from "crypto";
import { describe, expect, it } from "vitest";
import {
  decideFactWrite,
  decideRefresh,
  findSensitiveHits,
  rankCanonicalFirst,
  redactSecrets,
  splitMarkdown,
} from "../../../../packages/db/src/lib/write-policy.ts";
import {
  ACCESS_TOKEN_TTL_SECONDS,
  REFRESH_TOKEN_TTL_SECONDS,
  buildClientAssertion,
  hashRefreshToken,
  issueAccessToken,
  verifyAccessToken,
} from "../../../../packages/db/src/lib/connector-tokens.ts";

describe("write policy", () => {
  it("strips secrets and asks before a shared save", () => {
    const decision = decideFactWrite({
      role: "member",
      confirmWrites: true,
      requireConfirm: false,
      confirmed: false,
      acknowledgeSensitive: false,
      content: "api_key=sk-abcdefghijklmnopqrstuvwxyz password=hunter2",
      blocklist: ["acme"],
      canonicalRequested: false,
      workspaceName: "Lab",
      memberCount: 3,
    });
    expect(decision.action).toBe("confirm");
    if (decision.action === "confirm") {
      expect(decision.redactions).toEqual(
        expect.arrayContaining(["openai_key", "password_assignment", "api_key_assignment"]),
      );
      expect(decision.message).toContain("Lab");
      expect(decision.message).toContain("3 people");
    }
  });

  it("holds back blocklisted terms until they are acknowledged", () => {
    const blocked = decideFactWrite({
      role: "admin",
      confirmWrites: false,
      requireConfirm: false,
      confirmed: true,
      acknowledgeSensitive: false,
      content: "Notes about the launch plan",
      blocklist: ["launch plan"],
      canonicalRequested: false,
      workspaceName: "Lab",
      memberCount: 2,
    });
    expect(blocked.action).toBe("confirm");
    if (blocked.action === "confirm") {
      expect(blocked.reason).toBe("sensitive");
    }

    const allowed = decideFactWrite({
      role: "admin",
      confirmWrites: false,
      requireConfirm: false,
      confirmed: true,
      acknowledgeSensitive: true,
      content: "Notes about the launch plan",
      blocklist: ["launch plan"],
      canonicalRequested: true,
      workspaceName: "Lab",
      memberCount: 2,
    });
    expect(allowed).toMatchObject({ action: "write", canonical: true });
  });

  it("refuses viewers and non-admin canonical marks", () => {
    expect(() =>
      decideFactWrite({
        role: "viewer",
        confirmWrites: false,
        requireConfirm: false,
        confirmed: true,
        acknowledgeSensitive: true,
        content: "hello",
        blocklist: [],
        canonicalRequested: false,
        workspaceName: "Lab",
        memberCount: 1,
      }),
    ).toThrow(/Viewers/);

    expect(() =>
      decideFactWrite({
        role: "member",
        confirmWrites: false,
        requireConfirm: false,
        confirmed: true,
        acknowledgeSensitive: true,
        content: "hello",
        blocklist: [],
        canonicalRequested: true,
        workspaceName: "Lab",
        memberCount: 1,
      }),
    ).toThrow(/admins/);
  });

  it("ranks canonical facts ahead of higher scores", () => {
    const ranked = rankCanonicalFirst([
      { id: "a", canonical: false, score: 0.9 },
      { id: "b", canonical: true, score: 0.1 },
    ]);
    expect(ranked.map((item) => item.id)).toEqual(["b", "a"]);
  });

  it("splits markdown on headings and by file", () => {
    const sections = splitMarkdown("# One\nAlpha\n## Two\nBeta\n", "heading", "notes.md");
    expect(sections).toEqual([
      { title: "One", content: "Alpha" },
      { title: "Two", content: "Beta" },
    ]);
    expect(splitMarkdown("plain", "file", "plain.txt")).toEqual([
      { title: "plain.txt", content: "plain" },
    ]);
  });

  it("matches blocklist literals", () => {
    expect(findSensitiveHits("Contains ACME", ["acme"])).toEqual(["acme"]);
  });

  it("redacts a private key block", () => {
    const content = "-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----";
    expect(redactSecrets(content).content).toBe("[redacted:private_key]");
  });

  it("rotates a fresh refresh token and revokes reuse", () => {
    const now = 1_000_000;
    expect(
      decideRefresh(
        { familyId: "fam", usedAt: null, expiresAt: now + 10, revoked: false },
        now,
      ),
    ).toEqual({ action: "rotate", familyId: "fam" });
    expect(
      decideRefresh(
        { familyId: "fam", usedAt: now - 1, expiresAt: now + 10, revoked: false },
        now,
      ),
    ).toEqual({ action: "revoke_family", familyId: "fam", reason: "reuse" });
    expect(decideRefresh(null, now)).toEqual({ action: "reject", reason: "unknown" });
  });
});

describe("connector tokens", () => {
  it("issues a 24 hour access token that verifies", () => {
    process.env.TOKEN_SIGNING_KEY = "test-signing-key";
    const issued = issueAccessToken("users/1", "client-a");
    expect(issued.expiresIn).toBe(ACCESS_TOKEN_TTL_SECONDS);
    expect(ACCESS_TOKEN_TTL_SECONDS).toBe(60 * 60 * 24);
    expect(REFRESH_TOKEN_TTL_SECONDS).toBe(60 * 60 * 24 * 90);
    expect(verifyAccessToken(issued.token)).toEqual({
      userId: "users/1",
      clientId: "client-a",
    });
    expect(hashRefreshToken("same")).toBe(hashRefreshToken("same"));
  });

  it("signs a Microsoft client assertion", () => {
    const { privateKey } = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
    const pem = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
    const assertion = buildClientAssertion({
      clientId: "app-id",
      tokenUrl: "https://login.microsoftonline.com/tenant/oauth2/v2.0/token",
      privateKeyPem: pem,
      now: 1_700_000_000,
    });
    const payload = JSON.parse(
      Buffer.from(assertion.split(".")[1], "base64url").toString(),
    );
    expect(payload.iss).toBe("app-id");
    expect(payload.aud).toContain("login.microsoftonline.com");
  });
});
