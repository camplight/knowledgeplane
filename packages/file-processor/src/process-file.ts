import { extractFactsAndRelationsFromFile } from "./extract-facts";
import { File, Fact, FactRelation } from "@knowledgeplane/db";
import { writeFile, mkdir } from "fs/promises";
import { join } from "path";
import { randomUUID } from "crypto";

export interface ProcessFileOptions {
  buffer: Buffer;
  filename: string;
  mimeType: string;
  uploadedBy: string;
  uploadsDir?: string;
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
 * Process a file upload: save file, delegate to OpenAI for processing, extract facts/relations, and create them in the database
 * The file is passed directly to OpenAI without text extraction - OpenAI handles all file processing internally
 */
export async function processFileUpload(
  options: ProcessFileOptions,
): Promise<ProcessFileResult> {
  const {
    buffer,
    filename,
    mimeType,
    uploadedBy,
    uploadsDir = process.env.UPLOADS_DIR || join(process.cwd(), "uploads"),
    openaiApiKey,
    openaiModel,
    temperature,
  } = options;

  // Ensure uploads directory exists
  try {
    await mkdir(uploadsDir, { recursive: true });
  } catch (error) {
    // Directory might already exist
  }

  // Save file to disk
  const fileId = randomUUID();
  const fileExtension = filename.split(".").pop() || "";
  const storageFilename = `${fileId}.${fileExtension}`;
  const storagePath = join(uploadsDir, storageFilename);

  await writeFile(storagePath, buffer);

  // Create file record
  const fileRecord = await File.create({
    filename: storageFilename,
    original_filename: filename,
    mime_type: mimeType,
    size: buffer.length,
    storage_path: storagePath,
    uploaded_by: uploadedBy,
    metadata: {
      original_filename: filename,
    },
  });

  // Extract facts and relations directly from file using OpenAI
  // OpenAI handles the file processing internally (no text extraction needed)
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
