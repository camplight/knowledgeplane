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
      id: "123e4567-e89b-12d3-a456-426614174000",
      namespace: "test-namespace",
      content: "Test content",
      tags: [],
      metadata: {},
      created_at: "2024-01-01T00:00:00Z",
      expires_at: null,
    };

    vi.mocked(Fact.write).mockResolvedValueOnce(mockFact);

    const result = await handleFactsWrite({
      namespace: "test-namespace",
      content: "Test content",
    });

    expect(result.content).toHaveLength(1);
    expect(result.content[0].type).toBe("text");
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.fact).toEqual(mockFact);
    expect(Fact.write).toHaveBeenCalledWith({
      namespace: "test-namespace",
      content: "Test content",
      tags: undefined,
      metadata: undefined,
      ttl: undefined,
    });
  });

  it("should handle facts.write with all fields", async () => {
    const mockFact = {
      id: "123e4567-e89b-12d3-a456-426614174000",
      namespace: "test-namespace",
      content: "Test content",
      tags: ["tag1", "tag2"],
      metadata: { key: "value" },
      created_at: "2024-01-01T00:00:00Z",
      expires_at: "2024-01-02T00:00:00Z",
    };

    vi.mocked(Fact.write).mockResolvedValueOnce(mockFact);

    const result = await handleFactsWrite({
      namespace: "test-namespace",
      content: "Test content",
      tags: ["tag1", "tag2"],
      metadata: { key: "value" },
      ttl: 86400,
    });

    expect(result.content).toHaveLength(1);
    expect(result.content[0].type).toBe("text");
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.fact).toEqual(mockFact);
    expect(Fact.write).toHaveBeenCalledWith({
      namespace: "test-namespace",
      content: "Test content",
      tags: ["tag1", "tag2"],
      metadata: { key: "value" },
      ttl: 86400,
    });
  });
});

