import { describe, it, expect } from "vitest";
import { createServer } from "../server.js";

describe("REST API server", () => {
  it("returns health status", async () => {
    const app = await createServer({ skipDbInit: true });
    const response = await app.inject({
      method: "GET",
      url: "/health",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: "ok" });
  });

  it("does not serve skill document", async () => {
    const app = await createServer({ skipDbInit: true });
    const response = await app.inject({
      method: "GET",
      url: "/skill.md",
    });

    expect(response.statusCode).toBe(404);
  });
});
