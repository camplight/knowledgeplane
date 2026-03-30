/**
 * Trigger embeddings for facts via queue
 * This demonstrates the real-time queue architecture
 */

import { collections } from "@knowledgeplane/db";

async function triggerEmbeddings(workspaceId: string) {
  console.log(`Finding facts without embeddings in workspace ${workspaceId}...`);

  // Find facts without embeddings
  const aql = `
    FOR fact IN facts
      FILTER fact.workspace_id == @workspaceId
      FILTER fact.embedding == null OR LENGTH(fact.embedding) == 0
      LIMIT 100
      RETURN fact
  `;

  const cursor = await collections.facts.database.query(aql, { workspaceId });
  const facts = await cursor.all();

  console.log(`Found ${facts.length} facts needing embeddings`);

  if (facts.length === 0) {
    console.log("All facts already have embeddings!");
    return;
  }

  // Trigger embedding generation for each fact
  // In production, this would be done via event emission or direct queue access
  // For now, create worker triggers
  for (const fact of facts) {
    await collections.worker_triggers.save({
      worker_name: 'embeddings-generator',
      status: 'pending',
      created_at: new Date().toISOString(),
      metadata: {
        type: 'fact',
        id: fact._id || fact._key,
        workspace_id: workspaceId
      }
    });
  }

  console.log(`Created ${facts.length} triggers for embedding generation`);
  console.log("Background worker will process these within 30 seconds");
}

const workspaceId = process.argv[2] || '74be80db-d802-480b-b7f6-6891095ce0eb';
triggerEmbeddings(workspaceId)
  .then(() => {
    console.log("Done!");
    process.exit(0);
  })
  .catch((error) => {
    console.error("Error:", error);
    process.exit(1);
  });
