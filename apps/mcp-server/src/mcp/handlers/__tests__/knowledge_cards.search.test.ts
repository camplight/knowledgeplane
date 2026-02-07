import { describe, it, expect, vi, beforeEach } from "vitest";
import { handleKnowledgeCardsSearch } from "../knowledge_cards.search.js";
import { searchKnowledgeCards } from "@knowledgeplane/api-core";

vi.mock("@knowledgeplane/api-core", () => ({
  searchKnowledgeCards: vi.fn(),
}));

describe("handleKnowledgeCardsSearch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns hits from shared search", async () => {
    vi.mocked(searchKnowledgeCards).mockResolvedValueOnce([
      {
        card: {
          id: "knowledge_cards/1",
          title: "Test",
          summary: "Summary",
          content: "Content",
          fact_ids: [],
          workspace_id: "workspaces/1",
          created_by: "users/1",
          last_updated_by: "users/1",
          metadata: {},
          created_at: "2024-01-01T00:00:00Z",
          updated_at: "2024-01-01T00:00:00Z",
        },
        score: 0.9,
      },
    ]);

    const result = await handleKnowledgeCardsSearch({
      query: "test",
      workspace_id: "workspaces/1",
      k: 5,
      offset: 0,
    });

    expect(searchKnowledgeCards).toHaveBeenCalledWith({
      query: "test",
      workspace_id: "workspaces/1",
      k: 5,
      offset: 0,
      use_vector_search: undefined,
    });

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.hits).toHaveLength(1);
    expect(parsed.hits[0].card.id).toBe("knowledge_cards/1");
    expect(parsed.hits[0].score).toBe(0.9);
  });
});
