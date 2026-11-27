import fs from "fs";
import path from "path";
import {
  findSensitiveHits,
  redactSecrets,
  splitMarkdown,
} from "../packages/db/src/lib/write-policy.ts";

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  if (index === -1) return undefined;
  return process.argv[index + 1];
}

function has(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

async function main() {
  const dir = arg("dir");
  const workspaceId = arg("workspace");
  const userId = arg("user");
  const split = (arg("split") || "heading") as "heading" | "file";
  const dryRun = has("dry-run") || !has("apply");
  const canonical = has("canonical");
  const blocklist = (arg("blocklist") || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

  if (!dir) {
    console.error(
      "Usage: kp-import --dir <folder> [--workspace <id> --user <id>] [--split heading|file] [--canonical] [--blocklist a,b] [--apply]",
    );
    process.exit(1);
  }
  if (!dryRun && (!workspaceId || !userId)) {
    console.error("--apply requires --workspace and --user");
    process.exit(1);
  }

  const files = fs
    .readdirSync(dir)
    .filter((name) => name.endsWith(".md") || name.endsWith(".txt"))
    .sort();

  const planned: { title: string; content: string; source: string; redactions: string[] }[] = [];
  const held: { source: string; title: string; hits: string[] }[] = [];

  for (const name of files) {
    const full = path.join(dir, name);
    const text = fs.readFileSync(full, "utf8");
    for (const section of splitMarkdown(text, split, name)) {
      const redacted = redactSecrets(section.content);
      const hits = findSensitiveHits(redacted.content, blocklist);
      if (hits.length > 0) {
        held.push({ source: name, title: section.title, hits });
        continue;
      }
      planned.push({
        title: section.title,
        content: redacted.content,
        source: name,
        redactions: redacted.redactions,
      });
    }
  }

  console.log(
    JSON.stringify(
      {
        dry_run: dryRun,
        files: files.length,
        import: planned.length,
        held_back: held,
        preview: planned.slice(0, 20).map((item) => ({
          title: item.title,
          source: item.source,
          redactions: item.redactions,
          chars: item.content.length,
        })),
      },
      null,
      2,
    ),
  );

  if (dryRun) {
    return;
  }

  const { init, Fact } = await import("@knowledgeplane/db");
  await init();
  for (const item of planned) {
    await Fact.write({
      content: item.content,
      metadata: { title: item.title, source: item.source },
      workspace_id: workspaceId!,
      created_by: userId!,
      last_updated_by: userId!,
      canonical,
    });
  }
  console.log(`Imported ${planned.length} facts`);
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
