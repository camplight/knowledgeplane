import {
  createAIModelClient,
  type ChatMessage,
  type ChatCompletionOptions,
} from "@knowledgeplane/aimodel";
import * as XLSX from "xlsx";

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
 * Extract facts and relations from a file by passing it directly to the AI model
 * - PDF files: Passed via base64 file input (OpenAI supports PDF via file type)
 * - Excel files: Converted to text format and passed as text content
 * - Other files: Converted to text and passed as text content
 * Based on: https://gist.github.com/outbounder/14c0c5df7f902b49a8219c05f3053a22
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

  // Check if it's an Excel file
  const isExcelFile =
    mimeType.includes("excel") ||
    mimeType.includes("spreadsheet") ||
    mimeType.includes("ms-excel") ||
    filename.endsWith(".xlsx") ||
    filename.endsWith(".xls");

  if (isExcelFile) {
    // Convert Excel file to text format
    try {
      const workbook = XLSX.read(buffer, { type: "buffer" });
      const sheetNames = workbook.SheetNames;
      let textContent = `Excel Spreadsheet: ${filename}\n\n`;

      for (const sheetName of sheetNames) {
        const sheet = workbook.Sheets[sheetName];
        const jsonData = XLSX.utils.sheet_to_json(sheet, { defval: "" });

        textContent += `\n=== Sheet: ${sheetName} ===\n`;
        if (jsonData.length > 0) {
          // Convert to a readable text format
          const headers = Object.keys(jsonData[0] as any);
          textContent += `Headers: ${headers.join(", ")}\n\n`;

          jsonData.forEach((row: any, index: number) => {
            textContent += `Row ${index + 1}:\n`;
            headers.forEach((header) => {
              const value = row[header] !== undefined ? String(row[header]) : "";
              if (value) {
                textContent += `  ${header}: ${value}\n`;
              }
            });
            textContent += "\n";
          });
        } else {
          textContent += "(Empty sheet)\n";
        }
      }

      // Limit content size
      const limitedContent = textContent.substring(0, 200000);

      const userPrompt = `Extract facts and relations from the following Excel spreadsheet:

Filename: ${filename}

Spreadsheet Content:
${limitedContent}`;

      messages = [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ];
    } catch (error) {
      throw new Error(
        `Failed to process Excel file: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  } else if (mimeType === "application/pdf") {
    // For PDF files, use the file input format (OpenAI supports PDF)
    const base64File = buffer.toString("base64");
    const fileData = `data:application/pdf;base64,${base64File}`;

    const userPrompt = `Extract facts and relations from the uploaded PDF file.

Filename: ${filename}

Analyze the file content and extract all relevant facts and their relationships.`;

    messages = [
      { role: "system", content: systemPrompt },
      {
        role: "user",
        content: [
          { type: "text", text: userPrompt },
          {
            type: "file",
            file: {
              file_data: fileData,
              filename: filename,
            },
          },
        ],
      },
    ];
  } else {
    // For other files (text, Word docs, etc.), convert to text and pass as text content
    let textContent: string;
    try {
      // Try to decode as UTF-8 text
      textContent = buffer.toString("utf-8");
    } catch (error) {
      // If UTF-8 fails, try to convert binary to a readable format
      textContent = `Binary file: ${filename}\nSize: ${buffer.length} bytes\nMIME Type: ${mimeType}\n\nNote: This file could not be converted to text.`;
    }

    // Limit content size
    const limitedContent = textContent.substring(0, 200000);

    const userPrompt = `Extract facts and relations from the following file:

Filename: ${filename}
File Type: ${mimeType}

File Content:
${limitedContent}`;

    messages = [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ];
  }

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
