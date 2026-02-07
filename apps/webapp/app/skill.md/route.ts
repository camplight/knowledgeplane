import { renderSkillMarkdown } from "@knowledgeplane/api-core";

function getOriginBase(request: Request) {
  const forwardedProto = request.headers.get("x-forwarded-proto") || "http";
  const forwardedHost =
    request.headers.get("x-forwarded-host") ||
    request.headers.get("host") ||
    "localhost";

  const base = forwardedHost.includes("://")
    ? new URL(forwardedHost)
    : new URL(`${forwardedProto}://${forwardedHost}`);

  base.port = "";
  return base.toString().replace(/\/$/, "");
}

// Subpaths mode only: keep single origin

export async function GET(request: Request) {
  try {
    const originBase = getOriginBase(request);

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
    return new Response("Skill document unavailable. Please try again later.", {
      status: 500,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
      },
    });
  }
}

