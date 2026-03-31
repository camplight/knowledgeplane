# Contributing to KnowledgePlane

Thank you for your interest in contributing to KnowledgePlane! We welcome contributions from everyone, whether it is a bug report, feature request, documentation improvement, or code change.

## Areas We Need Help

We're a small team and appreciate contributions in these areas:

- **MCP tools** -- New tools for the MCP server, improved search/retrieval, better tool descriptions
- **Web dashboard** -- UI improvements, new views (graph visualization, timeline), accessibility
- **Documentation** -- Tutorials, integration guides, architecture deep-dives
- **Testing** -- Integration tests, edge case coverage, benchmark improvements
- **Integrations** -- Adapters for other AI tools and platforms beyond Claude Desktop

## How to Contribute

### Development Setup

1. Fork and clone the repository:

   ```bash
   git clone https://github.com/camplight/knowledgeplane.git
   cd knowledgeplane
   ```

2. Install dependencies and bootstrap the monorepo:

   ```bash
   npm run bootstrap
   ```

3. Start the development environment:

   ```bash
   npm run dev
   ```

For detailed setup instructions (ArangoDB, environment variables, Docker, etc.), see [DEVELOPMENT.md](DEVELOPMENT.md).

### Branch Naming

Use the following prefixes for your branches:

- `feature/` -- New features (e.g., `feature/workspace-sharing`)
- `fix/` -- Bug fixes (e.g., `fix/search-timeout`)
- `docs/` -- Documentation changes (e.g., `docs/api-reference`)

### Commit Messages

We follow [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/). Each commit message should be structured as:

```
<type>: <description>
```

Supported types:

- `feat:` -- A new feature
- `fix:` -- A bug fix
- `docs:` -- Documentation changes
- `chore:` -- Maintenance tasks (CI, tooling, dependencies)
- `refactor:` -- Code changes that neither fix a bug nor add a feature
- `test:` -- Adding or updating tests
- `perf:` -- Performance improvements

Examples:

```
feat: add vector search to knowledge card queries
fix: handle empty embedding field in consolidation worker
docs: update REST API endpoint documentation
test: add integration tests for file upload extraction
```

### Pull Request Guidelines

1. **Describe your changes** -- Provide a clear summary of what the PR does and why.
2. **Reference issues** -- Link related GitHub issues (e.g., "Closes #42").
3. **Add tests** -- New features and bug fixes should include tests.
4. **Pass checks** -- Before submitting, run:

   ```bash
   npm run typecheck
   npm run lint
   npm run test
   ```

5. **Keep PRs focused** -- One logical change per PR. Split large changes into smaller, reviewable pieces.
6. **Update documentation** -- If your change affects public APIs or user-facing behavior, update the relevant docs.

### Code Style

- **TypeScript** -- All source code is written in TypeScript. Follow the existing patterns in the codebase.
- **No new dependencies without discussion** -- If your change requires a new dependency, open an issue first to discuss the rationale and alternatives.
- **Existing patterns** -- Match the conventions, naming, and structure already present in the code.

### Testing

Run the full test suite:

```bash
npm run test
```

Add tests for any new features or bug fixes. We use the existing test infrastructure in the `tests/` directory.

### Reporting Bugs

Use the [GitHub issue tracker](https://github.com/camplight/knowledgeplane/issues) to report bugs. Please include:

- A clear and descriptive title
- Steps to reproduce the issue
- Expected vs. actual behavior
- Environment details (OS, Node.js version, ArangoDB version)
- Any relevant logs or error messages

### Feature Requests

Use the [GitHub issue tracker](https://github.com/camplight/knowledgeplane/issues) to request features. Please include:

- A clear description of the feature and the problem it solves
- Any alternatives you have considered
- Context on how you would use this feature

### Code of Conduct

This project adheres to a [Code of Conduct](CODE_OF_CONDUCT.md). By participating, you are expected to uphold this standard. Please report unacceptable behavior to opensource@camplight.net.

---

Thank you for helping make KnowledgePlane better!
