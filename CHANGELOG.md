# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2026-03-30

### Added

- MCP server with full Model Context Protocol support (HTTP/SSE and stdio)
- REST API for facts, relations, knowledge cards, workspaces, and users
- Web dashboard (Next.js) for browsing and managing knowledge
- ArangoDB-backed knowledge graph with vector embeddings
- Hybrid search: vector similarity + graph traversal
- Auto-consolidation: background workers merge related facts into knowledge cards
- BGE cross-encoder reranker for improved search relevance
- File upload and fact extraction (PDF, DOCX, Excel, CSV)
- Google and GitHub OAuth authentication
- API key authentication
- Multi-workspace support with isolation
- Workspace-scoped security for all API endpoints
- Audit trails for all fact operations
- Embedding queue for real-time async processing
- Docker Compose configs for development and production
- Comprehensive benchmark suite (HotpotQA, RelationRecall, LongMemEval)
- Environment variable waterfall configuration (root -> service overrides)
