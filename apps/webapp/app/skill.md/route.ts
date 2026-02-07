import { renderSkillMarkdown } from "@knowledgeplane/api-core";

// Subpaths mode only: keep single origin

export async function GET(request: Request) {
  try {
    const originBase = (process.env.APP_URL || "http://localhost:3000").replace(
      /\/$/,
      "",
    );

    const rendered = await renderSkillMarkdown({
      originBase,
    });
    return new Response(rendered, {
      status: 200,
      headers: {
        "Content-Type": "text/markdown; charset=utf-8",
        "Cache-Control": "public, max-age=300",
      },
    });
  } catch (error) {
    console.error(error);
    return new Response("Skill document unavailable. Please try again later.", {
      status: 500,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
      },
    });
  }
}
