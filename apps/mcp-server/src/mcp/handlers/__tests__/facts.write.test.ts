import { describe, it, expect, vi, beforeEach } from "vitest";
import { handleFactsWrite } from "../facts.write.js";
import { Fact } from "@knowledgeplane/db";

vi.mock("@knowledgeplane/db", () => ({
  Fact: {
    write: vi.fn(),
  },
}));

describe("handleFactsWrite", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should handle facts.write with minimal fields", async () => {
    const mockFact = {
      id: "facts/123",
      content: "Test content",
      metadata: {},
      workspace_id: "workspaces/1",
      created_by: "users/1",
      last_updated_by: "users/1",
      created_at: "2024-01-01T00:00:00Z",
      updated_at: "2024-01-01T00:00:00Z",
      trashed: false,
    };

    vi.mocked(Fact.write).mockResolvedValueOnce(mockFact);

    const result = await handleFactsWrite({
      content: "Test content",
      workspace_id: "workspaces/1",
      created_by: "users/1",
      last_updated_by: "users/1",
    });

    expect(result.content).toHaveLength(1);
    expect(result.content[0].type).toBe("text");
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.fact).toEqual(mockFact);
    expect(Fact.write).toHaveBeenCalledWith({
      content: "Test content",
      metadata: undefined,
      workspace_id: "workspaces/1",
      created_by: "users/1",
      last_updated_by: "users/1",
    });
  });

  it("should handle facts.write with all fields", async () => {
    const mockFact = {
      id: "facts/123",
      content: "Test content",
      metadata: { key: "value" },
      workspace_id: "workspaces/1",
      created_by: "users/1",
      last_updated_by: "users/2",
      created_at: "2024-01-01T00:00:00Z",
      updated_at: "2024-01-01T00:00:00Z",
      trashed: false,
    };

    vi.mocked(Fact.write).mockResolvedValueOnce(mockFact);

    const result = await handleFactsWrite({
      content: "Test content",
      metadata: { key: "value" },
      workspace_id: "workspaces/1",
      created_by: "users/1",
      last_updated_by: "users/2",
    });

    expect(result.content).toHaveLength(1);
    expect(result.content[0].type).toBe("text");
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.fact).toEqual(mockFact);
    expect(Fact.write).toHaveBeenCalledWith({
      content: "Test content",
      metadata: { key: "value" },
      workspace_id: "workspaces/1",
      created_by: "users/1",
      last_updated_by: "users/2",
    });
  });
});

