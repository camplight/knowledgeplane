import { extractFactsAndRelationsFromFile } from "./extract-facts";
import { File, Fact, FactRelation } from "@knowledgeplane/db";
import { randomUUID } from "crypto";

export interface ProcessFileOptions {
  buffer: Buffer;
  filename: string;
  mimeType: string;
  workspaceId: string;
  uploadedBy: string;
  openaiApiKey?: string;
  openaiModel?: string;
  temperature?: number;
}

export interface ProcessFileResult {
  file: {
    id: string;
    filename: string;
    original_filename: string;
    size: number;
    mime_type: string;
  };
  factsCreated: number;
  relationsCreated: number;
  facts: Array<{
    id: string;
    content: string;
  }>;
}

/**
 * Process a file upload: extract facts/relations using AI, and create them in the database
 * Files are passed directly to OpenAI using base64 encoding - no local storage required
 */
export async function processFileUpload(
  options: ProcessFileOptions,
): Promise<ProcessFileResult> {
  const {
    buffer,
    filename,
    mimeType,
    workspaceId,
    uploadedBy,
    openaiApiKey,
    openaiModel,
    temperature,
  } = options;

  // Create file record (no local storage - file is only stored in database metadata)
  const fileId = randomUUID();
  const fileRecord = await File.create({
    filename: filename, // Use original filename since we're not storing locally
    original_filename: filename,
    mime_type: mimeType,
    size: buffer.length,
    storage_path: "", // No local storage path
    workspace_id: workspaceId,
    uploaded_by: uploadedBy,
    metadata: {
      original_filename: filename,
    },
  });

  // Extract facts and relations directly from file using OpenAI
  // File is passed as base64 in the message content - no local storage or Files API needed
  const { facts, relations } = await extractFactsAndRelationsFromFile(
    buffer,
    filename,
    mimeType,
    {
      openaiApiKey,
      openaiModel,
      temperature,
    },
  );

  // Create facts
  const createdFacts = await Promise.all(
    facts.map((fact) =>
      Fact.write({
        content: fact.content,
        metadata: {
          ...fact.metadata,
          source_file: fileRecord.id,
          source_filename: filename,
        },
        workspace_id: workspaceId,
        created_by: uploadedBy,
        last_updated_by: uploadedBy,
      }),
    ),
  );

  // Create relations between facts
  const createdRelations: any[] = [];
  for (const relation of relations) {
    // Find matching facts by content
    const fromFact = createdFacts.find(
      (f) => f.content === relation.from_content,
    );
    const toFact = createdFacts.find((f) => f.content === relation.to_content);

    if (fromFact && toFact) {
      try {
        const rel = await FactRelation.create({
          from_fact: fromFact.id,
          to_fact: toFact.id,
          type: relation.type,
          workspace_id: workspaceId,
          metadata: {
            ...relation.metadata,
            source_file: fileRecord.id,
          },
          created_by: uploadedBy,
        });
        createdRelations.push(rel);
      } catch (error) {
        // Relation might already exist, skip
        console.warn("Failed to create relation:", error);
      }
    }
  }

  // Update facts with file reference in metadata
  for (const fact of createdFacts) {
    try {
      await Fact.update({
        id: fact.id,
        metadata: {
          ...fact.metadata,
          source_file: fileRecord.id,
        },
        last_updated_by: uploadedBy,
      });
    } catch (error) {
      console.warn("Failed to update fact with file reference:", error);
    }
  }

  // Update file record with fact IDs
  await File.update({
    id: fileRecord.id,
    fact_ids: createdFacts.map((f) => f.id),
  });

  return {
    file: {
      id: fileRecord.id,
      filename: fileRecord.filename,
      original_filename: fileRecord.original_filename,
      size: fileRecord.size,
      mime_type: fileRecord.mime_type,
    },
    factsCreated: createdFacts.length,
    relationsCreated: createdRelations.length,
    facts: createdFacts.map((f) => ({
      id: f.id,
      content: f.content,
    })),
  };
}
