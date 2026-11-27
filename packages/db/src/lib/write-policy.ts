export type WorkspaceRole = "owner" | "admin" | "member" | "viewer";

const SECRET_PATTERNS: { name: string; pattern: RegExp }[] = [
  { name: "aws_access_key", pattern: /\bAKIA[0-9A-Z]{16}\b/g },
  { name: "github_token", pattern: /\bgh[pousr]_[A-Za-z0-9_]{20,}\b/g },
  { name: "openai_key", pattern: /\bsk-[A-Za-z0-9]{20,}\b/g },
  { name: "slack_token", pattern: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/g },
  {
    name: "private_key",
    pattern:
      /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----[\s\S]*?-----END (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g,
  },
  {
    name: "password_assignment",
    pattern: /\b(?:password|passwd|pwd)\s*[:=]\s*\S+/gi,
  },
  {
    name: "api_key_assignment",
    pattern:
      /\b(?:api[_-]?key|secret|access[_-]?token|refresh[_-]?token)\s*[:=]\s*\S+/gi,
  },
  { name: "bearer", pattern: /\bBearer\s+[A-Za-z0-9\-._~+/]+=*/gi },
];

const WRITE_TOOLS = new Set([
  "facts_write",
  "facts_bulkwrite",
  "facts_update",
  "facts_trash",
  "facts_consolidate",
  "files_upload",
  "files_update",
  "files_delete",
  "fact_relations_create",
  "fact_relations_update",
  "fact_relations_delete",
  "knowledge_cards_create",
  "knowledge_cards_update",
  "knowledge_cards_delete",
  "knowledge_cards_split",
  "knowledge_cards_combine",
]);

export function isWriter(role: WorkspaceRole): boolean {
  return role === "owner" || role === "admin" || role === "member";
}

export function isAdmin(role: WorkspaceRole): boolean {
  return role === "owner" || role === "admin";
}

export function toolNeedsWriter(name: string): boolean {
  return WRITE_TOOLS.has(name);
}

export function redactSecrets(content: string): {
  content: string;
  redactions: string[];
} {
  let next = content;
  const redactions: string[] = [];
  for (const { name, pattern } of SECRET_PATTERNS) {
    pattern.lastIndex = 0;
    if (!pattern.test(next)) {
      continue;
    }
    pattern.lastIndex = 0;
    next = next.replace(pattern, `[redacted:${name}]`);
    redactions.push(name);
  }
  return { content: next, redactions };
}

export function findSensitiveHits(content: string, patterns: string[]): string[] {
  const hits: string[] = [];
  const haystack = content.toLowerCase();
  for (const raw of patterns) {
    const term = raw.trim();
    if (!term) {
      continue;
    }
    if (term.startsWith("/") && term.lastIndexOf("/") > 0) {
      const last = term.lastIndexOf("/");
      try {
        const re = new RegExp(term.slice(1, last), term.slice(last + 1));
        if (re.test(content)) {
          hits.push(term);
        }
        continue;
      } catch {
        // Fall through and treat the pattern as a literal word.
      }
    }
    if (haystack.includes(term.toLowerCase())) {
      hits.push(term);
    }
  }
  return hits;
}

export interface WriteDecisionInput {
  role: WorkspaceRole;
  confirmWrites: boolean;
  requireConfirm: boolean;
  confirmed: boolean;
  acknowledgeSensitive: boolean;
  content: string;
  blocklist: string[];
  canonicalRequested: boolean;
  workspaceName: string;
  memberCount: number;
}

export type WriteDecision =
  | {
      action: "write";
      content: string;
      redactions: string[];
      canonical: boolean;
    }
  | {
      action: "confirm";
      reason: "confirm" | "sensitive";
      message: string;
      redactions: string[];
    };

export function decideFactWrite(input: WriteDecisionInput): WriteDecision {
  if (!isWriter(input.role)) {
    throw new Error("Viewers can only read this workspace");
  }
  if (input.canonicalRequested && !isAdmin(input.role)) {
    throw new Error("Only admins can mark a fact canonical");
  }

  const redacted = redactSecrets(input.content);
  const hits = findSensitiveHits(redacted.content, input.blocklist);
  if (hits.length > 0 && !input.acknowledgeSensitive) {
    return {
      action: "confirm",
      reason: "sensitive",
      redactions: redacted.redactions,
      message: `This fact matches sensitive terms (${hits.join(", ")}). Nothing was saved. Call again with acknowledge_sensitive: true to keep it in ${input.workspaceName}, or remove the terms.`,
    };
  }

  const mustConfirm = input.requireConfirm || input.confirmWrites;
  if (mustConfirm && !input.confirmed) {
    return {
      action: "confirm",
      reason: "confirm",
      redactions: redacted.redactions,
      message: `Saving to ${input.workspaceName}. ${input.memberCount} ${input.memberCount === 1 ? "person" : "people"} can see this. Call again with confirmed: true to save.`,
    };
  }

  return {
    action: "write",
    content: redacted.content,
    redactions: redacted.redactions,
    canonical: input.canonicalRequested,
  };
}

export function rankCanonicalFirst<T extends { canonical?: boolean; score: number }>(
  results: T[],
): T[] {
  return [...results].sort((a, b) => {
    const canonicalDelta = Number(Boolean(b.canonical)) - Number(Boolean(a.canonical));
    if (canonicalDelta !== 0) {
      return canonicalDelta;
    }
    return b.score - a.score;
  });
}

export interface MarkdownSection {
  title: string;
  content: string;
}

export function splitMarkdown(
  text: string,
  mode: "heading" | "file",
  filename: string,
): MarkdownSection[] {
  const trimmed = text.trim();
  if (!trimmed) {
    return [];
  }
  if (mode === "file") {
    return [{ title: filename, content: trimmed }];
  }

  const sections: MarkdownSection[] = [];
  let title = filename;
  let buf: string[] = [];
  const flush = () => {
    const content = buf.join("\n").trim();
    if (content) {
      sections.push({ title, content });
    }
    buf = [];
  };

  for (const line of text.split(/\r?\n/)) {
    const match = /^(#{1,6})\s+(.+)$/.exec(line);
    if (match) {
      flush();
      title = match[2].trim();
    } else {
      buf.push(line);
    }
  }
  flush();
  return sections;
}

export interface RefreshRecord {
  familyId: string;
  usedAt: number | null;
  expiresAt: number;
  revoked: boolean;
}

export type RefreshDecision =
  | { action: "rotate"; familyId: string }
  | { action: "revoke_family"; familyId: string; reason: "reuse" | "revoked" | "expired" }
  | { action: "reject"; reason: "unknown" };

export function decideRefresh(
  record: RefreshRecord | null,
  now: number,
): RefreshDecision {
  if (!record) {
    return { action: "reject", reason: "unknown" };
  }
  if (record.revoked) {
    return { action: "revoke_family", familyId: record.familyId, reason: "revoked" };
  }
  if (record.expiresAt <= now) {
    return { action: "revoke_family", familyId: record.familyId, reason: "expired" };
  }
  if (record.usedAt !== null) {
    return { action: "revoke_family", familyId: record.familyId, reason: "reuse" };
  }
  return { action: "rotate", familyId: record.familyId };
}
