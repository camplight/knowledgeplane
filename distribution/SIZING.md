# Sizing

Measured with `node scripts/measure-fact-size.mjs` on 10,000 facts of 800 characters each (plain text, no embeddings):

- 800 bytes per fact
- 8,000,000 bytes of text
- 7.63 MiB of fact text

Embeddings are 1536 floats per fact once the background worker fills them in. That is about 6 KB of vector payload per fact, about 60 MiB for 10,000 facts, plus ArangoDB and index overhead. The distribution stack is ArangoDB, the MCP server, the web app, background workers, and Caddy.

Text size is small next to the database and the workers. Leave extra disk for backups. Indexing time depends on the embedding provider and was not measured here.
