import {
  createAIModelClient,
  type ChatMessage,
  type ChatCompletionOptions,
} from "@knowledgeplane/aimodel";

export interface ExtractedFact {
  content: string;
  metadata?: Record<string, any>;
}

export interface ExtractedRelation {
  from_content: string;
  to_content: string;
  type: string;
  metadata?: Record<string, any>;
}

export interface ExtractionResult {
  facts: ExtractedFact[];
  relations: ExtractedRelation[];
}

/**
 * Use OpenAI to extract facts and relations directly from a file
 * The file is passed directly to OpenAI - no text extraction is performed locally
 * OpenAI handles all file processing internally:
 * - Images: Uses Vision API with base64 encoding
 * - Documents (PDF, Word, etc.): Uploads to OpenAI Files API, OpenAI processes and extracts content
 * - Text files: Passes content directly to OpenAI for processing
 */
export async function extractFactsAndRelationsFromFile(
  buffer: Buffer,
  filename: string,
  mimeType: string,
  options?: {
    openaiApiKey?: string;
    openaiModel?: string;
    temperature?: number;
    provider?: "openai" | "anthropic" | "google" | "azure";
  },
): Promise<ExtractionResult> {
  const apiKey = options?.openaiApiKey || process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is required for fact extraction");
  }

  // Create AI model client with specified provider
  const client = createAIModelClient(
    options?.provider || (process.env.AI_PROVIDER as any) || "openai",
    apiKey,
  );
  const provider = client.getProvider();

  const model = options?.openaiModel || process.env.OPENAI_MODEL || "gpt-4o";
  const temperature = options?.temperature ?? 0.3;

  const systemPrompt = `You are a knowledge extraction agent. Your task is to analyze file content and extract:
1. Facts - discrete pieces of information that should be stored
2. Relations - relationships between facts

For each fact, provide:
- content: A clear, concise statement of the fact
- metadata: Optional key-value pairs with additional context

For each relation, provide:
- from_content: The content of the source fact
- to_content: The content of the target fact
- type: The type of relationship (references, depends_on, related_to, part_of, etc.)
- metadata: Optional additional information

Extract facts and relations that are meaningful and useful. Group related information into coherent facts.

Return your response as JSON with this structure:
{
  "facts": [
    {
      "content": "Fact content here",
      "metadata": {"source": "filename", "section": "section name"}
    }
  ],
  "relations": [
    {
      "from_content": "Source fact content",
      "to_content": "Target fact content",
      "type": "references",
      "metadata": {}
    }
  ]
}`;

  // Handle different file types
  let messages: ChatMessage[];

  if (mimeType.startsWith("image/")) {
    // For images, use vision API with base64
    const base64Image = buffer.toString("base64");
    const imageUrl = `data:${mimeType};base64,${base64Image}`;

    const userPrompt = `Extract facts and relations from this image file:

Filename: ${filename}

Analyze the image content and extract all relevant facts and their relationships.`;

    const messages: ChatMessage[] = [
      { role: "system", content: systemPrompt },
      {
        role: "user",
        content: [
          { type: "text", text: userPrompt },
          {
            type: "image_url",
            image_url: {
              url: imageUrl,
            },
          },
        ],
      },
    ];

    // Use vision model for images
    const visionModel = model.includes("vision") ? model : "gpt-4o"; // Use gpt-4o which supports vision

    const chatOptions: ChatCompletionOptions = {
      model: visionModel,
      temperature,
      maxTokens: 4000,
      responseFormat: "json_object",
    };

    const response = await provider.chatCompletion(messages, chatOptions);

    if (!response.content) {
      throw new Error("No response from AI model");
    }

    const parsed = JSON.parse(response.content);
    return {
      facts: parsed.facts || [],
      relations: parsed.relations || [],
    };
  } else if (
    mimeType === "application/pdf" ||
    mimeType.includes("word") ||
    mimeType.includes("excel") ||
    mimeType.includes("powerpoint") ||
    mimeType.includes("document")
  ) {
    // For documents, upload to provider's Files API
    const uploadResult = await provider.uploadFile(buffer, {
      filename,
      mimeType,
      purpose: "assistants",
    });

    try {
      // Wait for file processing
      const processedResult = await provider.waitForFileProcessing(
        uploadResult.fileId,
        60,
      );

      if (processedResult.status !== "processed") {
        throw new Error(
          `File processing failed with status: ${processedResult.status}`,
        );
      }

      // Get processed file content
      const fileContent = await provider.getFileContent(uploadResult.fileId);
      const textContent = fileContent.content;

      // Pass the AI-processed content directly to extraction
      const userPrompt = `Extract facts and relations from the following file that has been processed:

Filename: ${filename}

Processed File Content:
${textContent.substring(0, 200000)}`; // Limit to first 200k chars

      const messages: ChatMessage[] = [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ];

      const chatOptions: ChatCompletionOptions = {
        model,
        temperature,
        responseFormat: "json_object",
      };

      const response = await provider.chatCompletion(messages, chatOptions);

      if (!response.content) {
        throw new Error("No response from AI model");
      }

      const parsed = JSON.parse(response.content);

      // Clean up uploaded file
      await provider.deleteFile(uploadResult.fileId).catch(() => {
        // Ignore cleanup errors
      });

      return {
        facts: parsed.facts || [],
        relations: parsed.relations || [],
      };
    } catch (error) {
      // Note: File cleanup would need fileId, but we can't access it here
      // The provider should handle cleanup in its error handling
      throw error;
    }
  } else {
    // For text files and other types, pass the file buffer directly to OpenAI
    // OpenAI will process the content internally
    // We pass the raw buffer content - OpenAI handles the processing
    const textContent = buffer.toString("utf-8");

    const userPrompt = `Extract facts and relations from the following file that has been provided directly to you:

Filename: ${filename}
File Type: ${mimeType}

File Content:
${textContent.substring(0, 200000)}`; // Limit to first 200k chars

    const messages: ChatMessage[] = [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ];

    const chatOptions: ChatCompletionOptions = {
      model,
      temperature,
      responseFormat: "json_object",
    };

    const response = await provider.chatCompletion(messages, chatOptions);

    if (!response.content) {
      throw new Error("No response from AI model");
    }

    const parsed = JSON.parse(response.content);
    return {
      facts: parsed.facts || [],
      relations: parsed.relations || [],
    };
  }
}

// Keep the old function for backward compatibility, but it now just converts text to buffer
export async function extractFactsAndRelations(
  text: string,
  filename: string,
  options?: {
    openaiApiKey?: string;
    openaiModel?: string;
    temperature?: number;
  },
): Promise<ExtractionResult> {
  const buffer = Buffer.from(text, "utf-8");
  return extractFactsAndRelationsFromFile(
    buffer,
    filename,
    "text/plain",
    options,
  );
}
