import { describe, it, expect, vi, beforeEach } from "vitest";
import { handleFactsSearch } from "../facts.search.js";
import { Fact } from "@knowledgeplane/db";

vi.mock("@knowledgeplane/db", () => ({
  Fact: {
    search: vi.fn(),
  },
}));

describe("handleFactsSearch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should handle facts.search with minimal fields", async () => {
    const mockHits = [
      {
        id: "123e4567-e89b-12d3-a456-426614174000",
        namespace: "test-namespace",
        content: "Test content",
        tags: [],
        metadata: {},
        created_at: "2024-01-01T00:00:00Z",
        expires_at: null,
        score: 0.5,
      },
    ];

    vi.mocked(Fact.search).mockResolvedValueOnce(mockHits);

    const result = await handleFactsSearch({
      query: "test query",
    });

    expect(result.content).toHaveLength(1);
    expect(result.content[0].type).toBe("text");
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.hits).toEqual(mockHits);
    expect(Fact.search).toHaveBeenCalledWith({
      query: "test query",
      namespace: undefined,
      k: undefined,
    });
  });

  it("should handle facts.search with all fields", async () => {
    const mockHits = [
      {
        id: "123e4567-e89b-12d3-a456-426614174000",
        namespace: "test-namespace",
        content: "Test content",
        tags: [],
        metadata: {},
        created_at: "2024-01-01T00:00:00Z",
        expires_at: null,
        score: 0.8,
      },
    ];

    vi.mocked(Fact.search).mockResolvedValueOnce(mockHits);

    const result = await handleFactsSearch({
      query: "test query",
      namespace: "test-namespace",
      k: 10,
    });

    expect(result.content).toHaveLength(1);
    expect(result.content[0].type).toBe("text");
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.hits).toEqual(mockHits);
    expect(Fact.search).toHaveBeenCalledWith({
      query: "test query",
      namespace: "test-namespace",
      k: 10,
    });
  });

  it("should handle empty search results", async () => {
    vi.mocked(Fact.search).mockResolvedValueOnce([]);

    const result = await handleFactsSearch({
      query: "test query",
    });

    expect(result.content).toHaveLength(1);
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.hits).toEqual([]);
  });

  it("should handle wildcard '*' query to search all facts", async () => {
    const mockHits = [
      {
        id: "123e4567-e89b-12d3-a456-426614174000",
        namespace: "test-namespace",
        content: "Test content 1",
        tags: [],
        metadata: {},
        created_at: "2024-01-01T00:00:00Z",
        expires_at: null,
        score: 1.0,
      },
      {
        id: "223e4567-e89b-12d3-a456-426614174001",
        namespace: "test-namespace",
        content: "Test content 2",
        tags: [],
        metadata: {},
        created_at: "2024-01-02T00:00:00Z",
        expires_at: null,
        score: 1.0,
      },
    ];

    vi.mocked(Fact.search).mockResolvedValueOnce(mockHits);

    const result = await handleFactsSearch({
      query: "*",
    });

    expect(result.content).toHaveLength(1);
    expect(result.content[0].type).toBe("text");
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.hits).toEqual(mockHits);
    expect(Fact.search).toHaveBeenCalledWith({
      query: "*",
      namespace: undefined,
      k: undefined,
    });
  });
});

