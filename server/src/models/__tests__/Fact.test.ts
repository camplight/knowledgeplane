import { describe, it, expect, vi, beforeEach } from "vitest";
import { Fact } from "../Fact.js";
import { query } from "../../lib/db.js";

vi.mock("../../db.js", () => ({
  query: vi.fn(),
}));

describe("Fact", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("write", () => {
    it("should write a fact with minimal required fields", async () => {
      const mockFact = {
        id: "123e4567-e89b-12d3-a456-426614174000",
        namespace: "test-namespace",
        content: "Test content",
        tags: [],
        metadata: {},
        created_at: "2024-01-01T00:00:00Z",
        expires_at: null,
      };

      vi.mocked(query).mockResolvedValueOnce({
        rows: [mockFact],
        rowCount: 1,
        command: "INSERT",
        oid: 0,
        fields: [],
      });

      const result = await Fact.write({
        namespace: "test-namespace",
        content: "Test content",
      });

      expect(result).toEqual(mockFact);
      expect(query).toHaveBeenCalledWith(
        expect.stringContaining("INSERT INTO fact"),
        ["test-namespace", "Test content", [], {}, null],
      );
    });

    it("should write a fact with all optional fields", async () => {
      const mockFact = {
        id: "123e4567-e89b-12d3-a456-426614174000",
        namespace: "test-namespace",
        content: "Test content",
        tags: ["tag1", "tag2"],
        metadata: { key: "value" },
        created_at: "2024-01-01T00:00:00Z",
        expires_at: "2024-01-02T00:00:00Z",
      };

      vi.mocked(query).mockResolvedValueOnce({
        rows: [mockFact],
        rowCount: 1,
        command: "INSERT",
        oid: 0,
        fields: [],
      });

      const result = await Fact.write({
        namespace: "test-namespace",
        content: "Test content",
        tags: ["tag1", "tag2"],
        metadata: { key: "value" },
        ttl: 86400,
      });

      expect(result).toEqual(mockFact);
      expect(query).toHaveBeenCalledWith(
        expect.stringContaining("INSERT INTO fact"),
        [
          "test-namespace",
          "Test content",
          ["tag1", "tag2"],
          { key: "value" },
          86400,
        ],
      );
    });

    it("should handle empty tags and metadata", async () => {
      const mockFact = {
        id: "123e4567-e89b-12d3-a456-426614174000",
        namespace: "test-namespace",
        content: "Test content",
        tags: [],
        metadata: {},
        created_at: "2024-01-01T00:00:00Z",
        expires_at: null,
      };

      vi.mocked(query).mockResolvedValueOnce({
        rows: [mockFact],
        rowCount: 1,
        command: "INSERT",
        oid: 0,
        fields: [],
      });

      await Fact.write({
        namespace: "test-namespace",
        content: "Test content",
        tags: undefined,
        metadata: undefined,
      });

      expect(query).toHaveBeenCalledWith(
        expect.stringContaining("INSERT INTO fact"),
        ["test-namespace", "Test content", [], {}, null],
      );
    });
  });

  describe("search", () => {
    it("should search facts with a query", async () => {
      const mockResults = [
        {
          id: "123e4567-e89b-12d3-a456-426614174000",
          namespace: "test-namespace",
          content: "Test content",
          tags: [],
          metadata: {},
          created_at: "2024-01-01T00:00:00Z",
          expires_at: null,
          score: "0.5",
        },
      ];

      vi.mocked(query).mockResolvedValueOnce({
        rows: mockResults,
        rowCount: 1,
        command: "SELECT",
        oid: 0,
        fields: [],
      });

      const result = await Fact.search({
        query: "test query",
      });

      expect(result).toHaveLength(1);
      expect(result[0].score).toBe(0.5);
      expect(query).toHaveBeenCalledWith(expect.stringContaining("SELECT"), [
        null,
        5,
        0,
        "%test query%",
      ]);
    });

    it("should search facts with namespace filter", async () => {
      const mockResults: any[] = [];

      vi.mocked(query).mockResolvedValueOnce({
        rows: mockResults,
        rowCount: 0,
        command: "SELECT",
        oid: 0,
        fields: [],
      });

      await Fact.search({
        query: "test query",
        namespace: "test-namespace",
      });

      expect(query).toHaveBeenCalledWith(expect.stringContaining("SELECT"), [
        "test-namespace",
        5,
        0,
        "%test query%",
      ]);
    });

    it("should search facts with custom k limit", async () => {
      const mockResults: any[] = [];

      vi.mocked(query).mockResolvedValueOnce({
        rows: mockResults,
        rowCount: 0,
        command: "SELECT",
        oid: 0,
        fields: [],
      });

      await Fact.search({
        query: "test query",
        k: 10,
      });

      expect(query).toHaveBeenCalledWith(expect.stringContaining("SELECT"), [
        null,
        10,
        0,
        "%test query%",
      ]);
    });

    it("should handle string scores and convert them to numbers", async () => {
      const mockResults = [
        {
          id: "123e4567-e89b-12d3-a456-426614174000",
          namespace: "test-namespace",
          content: "Test content",
          tags: [],
          metadata: {},
          created_at: "2024-01-01T00:00:00Z",
          expires_at: null,
          score: "0.823",
        },
      ];

      vi.mocked(query).mockResolvedValueOnce({
        rows: mockResults,
        rowCount: 1,
        command: "SELECT",
        oid: 0,
        fields: [],
      });

      const result = await Fact.search({
        query: "test query",
      });

      expect(result[0].score).toBe(0.823);
    });

    it("should default score to 0 if score is invalid", async () => {
      const mockResults = [
        {
          id: "123e4567-e89b-12d3-a456-426614174000",
          namespace: "test-namespace",
          content: "Test content",
          tags: [],
          metadata: {},
          created_at: "2024-01-01T00:00:00Z",
          expires_at: null,
          score: null,
        },
      ];

      vi.mocked(query).mockResolvedValueOnce({
        rows: mockResults,
        rowCount: 1,
        command: "SELECT",
        oid: 0,
        fields: [],
      });

      const result = await Fact.search({
        query: "test query",
      });

      expect(result[0].score).toBe(0);
    });

    it("should search all facts when query is '*' wildcard", async () => {
      const mockResults = [
        {
          id: "123e4567-e89b-12d3-a456-426614174000",
          namespace: "test-namespace",
          content: "Test content 1",
          tags: [],
          metadata: {},
          created_at: "2024-01-01T00:00:00Z",
          expires_at: null,
          score: "1.0",
        },
        {
          id: "223e4567-e89b-12d3-a456-426614174001",
          namespace: "test-namespace",
          content: "Test content 2",
          tags: [],
          metadata: {},
          created_at: "2024-01-02T00:00:00Z",
          expires_at: null,
          score: "1.0",
        },
      ];

      vi.mocked(query).mockResolvedValueOnce({
        rows: mockResults,
        rowCount: 2,
        command: "SELECT",
        oid: 0,
        fields: [],
      });

      const result = await Fact.search({
        query: "*",
      });

      expect(result).toHaveLength(2);
      expect(query).toHaveBeenCalledWith(expect.stringContaining("SELECT"), [
        null,
        5,
        0,
      ]);
      // Verify the SQL doesn't contain ILIKE clause
      const callArgs = vi.mocked(query).mock.calls[0];
      expect(callArgs[0]).not.toContain("ILIKE");
    });

    it("should search all facts with namespace filter when query is '*' wildcard", async () => {
      const mockResults: any[] = [];

      vi.mocked(query).mockResolvedValueOnce({
        rows: mockResults,
        rowCount: 0,
        command: "SELECT",
        oid: 0,
        fields: [],
      });

      await Fact.search({
        query: "*",
        namespace: "test-namespace",
      });

      expect(query).toHaveBeenCalledWith(expect.stringContaining("SELECT"), [
        "test-namespace",
        5,
        0,
      ]);
      // Verify the SQL doesn't contain ILIKE clause
      const callArgs = vi.mocked(query).mock.calls[0];
      expect(callArgs[0]).not.toContain("ILIKE");
    });
  });
});
