import { FastifyInstance } from "fastify";
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { appRouter } from "../trpc/routes/index.js";
import { createContext } from "../trpc/context.js";

export default async function trpcRoutes(app: FastifyInstance) {
  // Handle tRPC requests
  app.all("/trpc/*", async (request, reply) => {
    const url = new URL(request.url, `${request.protocol}://${request.hostname}`);
    
    let body: string | undefined;
    if (request.method !== "GET" && request.method !== "HEAD") {
      body = request.body ? JSON.stringify(request.body) : undefined;
    }

    const response = await fetchRequestHandler({
      endpoint: "/trpc",
      req: new Request(url.toString(), {
        method: request.method,
        headers: request.headers as HeadersInit,
        body,
      }),
      router: appRouter,
      createContext: async () => {
        return await createContext({ req: request, reply });
      },
      onError: ({ path, error }) => {
        app.log.error(
          { path, error: error.message, code: error.code },
          "tRPC error"
        );
      },
    });

    const responseBody = await response.text();
    const headers: Record<string, string> = {};
    response.headers.forEach((value, key) => {
      headers[key] = value;
    });

    return reply
      .code(response.status)
      .headers(headers)
      .send(responseBody);
  });
}

