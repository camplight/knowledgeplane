import { describe, it, expect } from "vitest";
import { mcpTools } from "../server.js";

describe("MCP tools", () => {
  it("uses underscore names (no dots)", () => {
    const names = mcpTools.map((tool) => tool.name);
    expect(names.length).toBeGreaterThan(0);
    for (const name of names) {
      expect(name.includes(".")).toBe(false);
    }
  });
});
