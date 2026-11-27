import fs from "fs";
import path from "path";

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  if (index === -1) return undefined;
  return process.argv[index + 1];
}

async function main() {
  const out = arg("out");
  const workspaceId = arg("workspace");
  if (!out) {
    console.error("Usage: kp-export --out <folder> [--workspace <id>]");
    process.exit(1);
  }

  const { init, Fact, KnowledgeCard } = await import("@knowledgeplane/db");
  await init();
  fs.mkdirSync(out, { recursive: true });

  const facts = await Fact.list(workspaceId, 100000, 0, true);
  const cards = workspaceId
    ? await KnowledgeCard.list(workspaceId, 100000, 0)
    : [];

  const records = { facts, cards };
  fs.writeFileSync(path.join(out, "records.json"), JSON.stringify(records, null, 2));

  facts.forEach((fact, index) => {
    const title = fact.metadata?.title || `fact-${index + 1}`;
    const safe = title.replace(/[^\w.-]+/g, "-").slice(0, 80);
    const body = [
      "---",
      `id: ${fact.id}`,
      `workspace_id: ${fact.workspace_id}`,
      `canonical: ${fact.canonical === true}`,
      `trashed: ${fact.trashed}`,
      "---",
      "",
      fact.content,
      "",
    ].join("\n");
    fs.writeFileSync(path.join(out, `${String(index + 1).padStart(4, "0")}-${safe}.md`), body);
  });

  console.log(`Exported ${facts.length} facts and ${cards.length} cards to ${out}`);
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
