import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const templatePath = path.resolve(__dirname, "../skill-template.md");

export type SkillRenderParams = {
  originBase: string;
};

export async function renderSkillMarkdown(
  params: SkillRenderParams,
): Promise<string> {
  const content = await readFile(templatePath, "utf-8");
  return content
    .replace(/{{ORIGIN_BASE}}/g, params.originBase);
}
