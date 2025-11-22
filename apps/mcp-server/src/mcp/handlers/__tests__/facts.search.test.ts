import { describe, it, expect, vi, beforeEach } from "vitest";
import { handleFactsSearch } from "../facts.search.js";
import { Fact } from "@knowledgeplane/db";

vi.mock("@knowledgeplane/db", () => ({
  Fact: {
    search: vi.fn(),
  },
}));

vi.mock("@knowledgeplane/aimodel", () => ({
  createAIModelClient: vi.fn(() => ({
    getProvider: vi.fn(() => ({} as any)),
  })),
}));

describe("handleFactsSearch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should handle facts.search with minimal fields", async () => {
    const mockHits = [
      {
        id: "facts/123",
        content: "Test content",
        metadata: {},
        created_at: "2024-01-01T00:00:00Z",
        updated_at: "2024-01-01T00:00:00Z",
        created_by: "users/1",
        last_updated_by: "users/1",
        trashed: false,
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
    expect(parsed.hits).toHaveLength(1);
    expect(parsed.hits[0].id).toBe("facts/123");
    expect(parsed.hits[0].content).toBe("Test content");
    expect(parsed.hits[0].score).toBe(0.5);
    // Should not include embeddings or internal fields
    expect(parsed.hits[0].embedding).toBeUndefined();
    expect(parsed.hits[0]._key).toBeUndefined();
    expect(parsed.hits[0]._id).toBeUndefined();
    expect(parsed.total_returned).toBe(1);
    expect(parsed.limit_used).toBe(5); // default limit
    expect(Fact.search).toHaveBeenCalledWith({
      query: "test query",
      k: 5,
      offset: undefined,
      include_trashed: undefined,
      use_vector_search: undefined,
      embeddingProvider: expect.anything(),
    });
  });

  it("should truncate long content and set content_truncated flag", async () => {
    const longContent = "a".repeat(600);
    const mockHits = [
      {
        id: "facts/123",
        content: longContent,
        metadata: {},
        created_at: "2024-01-01T00:00:00Z",
        updated_at: "2024-01-01T00:00:00Z",
        created_by: "users/1",
        last_updated_by: "users/1",
        trashed: false,
        score: 0.8,
      },
    ];

    vi.mocked(Fact.search).mockResolvedValueOnce(mockHits);

    const result = await handleFactsSearch({
      query: "test query",
      k: 10,
    });

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.hits[0].content).toHaveLength(503); // 500 + "..."
    expect(parsed.hits[0].content).toEndWith("...");
    expect(parsed.hits[0].content_truncated).toBe(true);
    expect(parsed.note).toContain("truncated");
  });

  it("should limit k to maximum 20", async () => {
    vi.mocked(Fact.search).mockResolvedValueOnce([]);

    await handleFactsSearch({
      query: "test query",
      k: 50, // Request 50, but should be limited to 20
    });

    expect(Fact.search).toHaveBeenCalledWith(
      expect.objectContaining({
        k: 20, // Should be capped at 20
      }),
    );
  });

  it("should handle facts.search with all parameters", async () => {
    const mockHits = [
      {
        id: "facts/123",
        content: "Test content",
        metadata: { source: "test" },
        created_at: "2024-01-01T00:00:00Z",
        updated_at: "2024-01-01T00:00:00Z",
        created_by: "users/1",
        last_updated_by: "users/1",
        trashed: false,
        score: 0.8,
      },
    ];

    vi.mocked(Fact.search).mockResolvedValueOnce(mockHits);

    const result = await handleFactsSearch({
      query: "test query",
      k: 10,
      offset: 5,
      include_trashed: true,
    });

    expect(result.content).toHaveLength(1);
    expect(result.content[0].type).toBe("text");
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.hits).toHaveLength(1);
    expect(parsed.limit_used).toBe(10);
    expect(Fact.search).toHaveBeenCalledWith({
      query: "test query",
      k: 10,
      offset: 5,
      include_trashed: true,
      use_vector_search: undefined,
      embeddingProvider: expect.anything(),
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
    expect(parsed.total_returned).toBe(0);
    expect(parsed.note).toBeUndefined(); // No truncation note for empty results
  });

  it("should remove embeddings and internal fields from results", async () => {
    const mockHits = [
      {
        _id: "facts/123",
        _key: "123",
        id: "facts/123",
        content: "Test content",
        metadata: {},
        created_at: "2024-01-01T00:00:00Z",
        updated_at: "2024-01-01T00:00:00Z",
        created_by: "users/1",
        last_updated_by: "users/1",
        trashed: false,
        embedding: [0.1, 0.2, 0.3],
        embedding_model: "text-embedding-3-small",
        score: 0.8,
      },
    ];

    vi.mocked(Fact.search).mockResolvedValueOnce(mockHits);

    const result = await handleFactsSearch({
      query: "test query",
    });

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.hits[0]._id).toBeUndefined();
    expect(parsed.hits[0]._key).toBeUndefined();
    expect(parsed.hits[0].embedding).toBeUndefined();
    expect(parsed.hits[0].embedding_model).toBeUndefined();
    expect(parsed.hits[0].id).toBe("facts/123");
    expect(parsed.hits[0].content).toBe("Test content");
  });

  it("should handle wildcard '*' query to search all facts", async () => {
    const mockHits = [
      {
        id: "facts/123",
        content: "Test content 1",
        metadata: {},
        created_at: "2024-01-01T00:00:00Z",
        updated_at: "2024-01-01T00:00:00Z",
        created_by: "users/1",
        last_updated_by: "users/1",
        trashed: false,
        score: 1.0,
      },
      {
        id: "facts/456",
        content: "Test content 2",
        metadata: {},
        created_at: "2024-01-02T00:00:00Z",
        updated_at: "2024-01-02T00:00:00Z",
        created_by: "users/1",
        last_updated_by: "users/1",
        trashed: false,
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
    expect(parsed.hits).toHaveLength(2);
    expect(parsed.total_returned).toBe(2);
    expect(Fact.search).toHaveBeenCalledWith({
      query: "*",
      k: 5,
      offset: undefined,
      include_trashed: undefined,
      use_vector_search: undefined,
      embeddingProvider: expect.anything(),
    });
  });
});

