import { DataSource, File, WorkerLog, collections } from "@knowledgeplane/db";
import {
  createAIModelClient,
  type ChatMessage,
  type ChatCompletionOptions,
} from "@knowledgeplane/aimodel";
import { randomUUID } from "node:crypto";
import * as path from "node:path";
import { Buffer } from "node:buffer";

interface ScheduleInterval {
  type: "interval";
  value: number; // milliseconds
}

interface ScheduleCron {
  type: "cron";
  value: string; // cron expression
}

type ParsedSchedule = ScheduleInterval | ScheduleCron;

/**
 * Parse schedule string into structured format
 * Supports:
 * - "every X minutes/hours/days"
 * - Cron expressions (e.g., "0 *\/6 * * *")
 * - Simple intervals (e.g., "3600000" for milliseconds)
 */
function parseSchedule(schedule: string): ParsedSchedule {
  const trimmed = schedule.trim().toLowerCase();

  // Check for "every X unit" format
  const everyMatch = trimmed.match(
    /^every\s+(\d+)\s+(minute|minutes|hour|hours|day|days)$/,
  );
  if (everyMatch) {
    const value = parseInt(everyMatch[1], 10);
    const unit = everyMatch[2];
    let ms = 0;
    if (unit.startsWith("minute")) {
      ms = value * 60 * 1000;
    } else if (unit.startsWith("hour")) {
      ms = value * 60 * 60 * 1000;
    } else if (unit.startsWith("day")) {
      ms = value * 24 * 60 * 60 * 1000;
    }
    return { type: "interval", value: ms };
  }

  // Check if it's a number (milliseconds)
  const numMatch = trimmed.match(/^\d+$/);
  if (numMatch) {
    return { type: "interval", value: parseInt(trimmed, 10) };
  }

  // Assume it's a cron expression
  return { type: "cron", value: schedule };
}

/**
 * Calculate next run time based on schedule
 */
function calculateNextRun(schedule: ParsedSchedule, lastRun?: string): string {
  const now = new Date();
  let nextRun: Date;

  if (schedule.type === "interval") {
    if (lastRun) {
      const lastRunDate = new Date(lastRun);
      nextRun = new Date(lastRunDate.getTime() + schedule.value);
      // If next run is in the past, set it to now + interval
      if (nextRun < now) {
        nextRun = new Date(now.getTime() + schedule.value);
      }
    } else {
      nextRun = new Date(now.getTime() + schedule.value);
    }
  } else {
    // For cron, we'll use a simple approach: run every hour if no last run
    // In production, you'd want to use a proper cron parser like node-cron
    if (lastRun) {
      const lastRunDate = new Date(lastRun);
      nextRun = new Date(lastRunDate.getTime() + 60 * 60 * 1000); // Default to 1 hour
    } else {
      nextRun = new Date(now.getTime() + 60 * 60 * 1000);
    }
  }

  return nextRun.toISOString();
}

/**
 * Extract content from file (supports .md and .zip)
 * File content is stored in metadata.content (as text for .md files)
 * For zip files, metadata.zip_content contains the zip file as base64
 */
async function extractDefinitionContent(fileRecord: any): Promise<{
  instructions: string;
  codeFiles: Array<{ filename: string; content: string }>;
}> {
  const metadata = fileRecord.metadata || {};

  // Check file extension
  const ext = path
    .extname(fileRecord.original_filename || fileRecord.filename)
    .toLowerCase();

  if (ext === ".md" || ext === ".txt") {
    // For text files, content should be in metadata.content as text
    const content = metadata.content || "";
    return {
      instructions: content,
      codeFiles: [],
    };
  } else if (ext === ".zip" || metadata.is_zip) {
    // For zip files, extract from metadata.zip_content (base64)
    const zipContentBase64 = metadata.zip_content;
    if (!zipContentBase64) {
      throw new Error("Zip file content not found in metadata");
    }

    // Extract zip files using adm-zip
    const AdmZip = (await import("adm-zip")).default;
    const zipBuffer = Buffer.from(zipContentBase64, "base64");
    const zip = new AdmZip(zipBuffer);
    const zipEntries = zip.getEntries();

    const instructions: string[] = [];
    const codeFiles: Array<{ filename: string; content: string }> = [];

    for (const entry of zipEntries) {
      // Skip directories
      if (entry.isDirectory) {
        continue;
      }

      const fileName = entry.entryName;
      const content = entry.getData().toString("utf-8");

      // Check if it's a markdown file (instructions)
      if (fileName.endsWith(".md") || fileName.endsWith(".txt")) {
        instructions.push(`# ${fileName}\n\n${content}`);
      } else {
        // Assume it's a code file
        codeFiles.push({ filename: fileName, content });
      }
    }

    return {
      instructions: instructions.join("\n\n"),
      codeFiles,
    };
  } else {
    // Try to read from metadata.content as fallback
    const content = metadata.content || "";
    return {
      instructions: content,
      codeFiles: [],
    };
  }
}

/**
 * Build MCP server URL with workspace context
 */
function getMcpServerUrl(workspaceId: string): string {
  let baseUrl: string;
  if (process.env.MCP_SERVER_URL) {
    baseUrl = process.env.MCP_SERVER_URL;
  } else {
    const protocol = process.env.MCP_SERVER_PROTOCOL || "http";
    const host = process.env.MCP_SERVER_HOST || "localhost";
    const port = process.env.MCP_SERVER_PORT || "8080";
    baseUrl = `${protocol}://${host}:${port}/mcp`;
  }

  const url = new URL(baseUrl);

  // Add API key as query parameter if provided
  if (process.env.MCP_SERVER_API_KEY) {
    url.searchParams.set("api_key", process.env.MCP_SERVER_API_KEY);
  }

  // Add workspace_id as query parameter
  url.searchParams.set("workspace_id", workspaceId);

  return url.toString();
}

export class DataSourceRunner {
  private aiClient: ReturnType<typeof createAIModelClient>;
  private interval: NodeJS.Timeout | null = null;
  private running = false;

  constructor() {
    const apiKey = process.env.OPENAI_API_KEY || process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error("AI API key environment variable is required");
    }
    this.aiClient = createAIModelClient(
      (process.env.AI_PROVIDER as any) || "openai",
      apiKey,
    );
  }

  start() {
    console.log("DataSource runner started");
    // Check for data sources to run every minute
    this.interval = setInterval(() => {
      this.process().catch((error) => {
        console.error("Error in data source runner:", error);
      });
    }, 60 * 1000);

    // Run immediately on start
    this.process().catch((error) => {
      console.error("Error in initial data source run:", error);
    });
  }

  stop() {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
    this.running = false;
    console.log("DataSource runner stopped");
  }

  private async process() {
    if (this.running) {
      return;
    }

    this.running = true;
    const startTime = Date.now();

    try {
      // Find data sources that are enabled and ready to run
      const dataSources = await DataSource.findEnabledForExecution();

      if (dataSources.length === 0) {
        return;
      }

      console.log(`Processing ${dataSources.length} data sources`);

      for (const dataSource of dataSources) {
        try {
          await this.runDataSource(dataSource);
        } catch (error: any) {
          console.error(`Error running data source ${dataSource.id}:`, error);
          await WorkerLog.create({
            worker_name: "data-source-runner",
            task_type: "data-source-execution",
            workspace_id: dataSource.workspace_id,
            status: "error",
            message: `Failed to run data source: ${dataSource.name}`,
            execution_time_ms: Date.now() - startTime,
            error: error.message || String(error),
          });
        }
      }
    } finally {
      this.running = false;
    }
  }

  private async runDataSource(dataSource: any) {
    const startTime = Date.now();
    let factsCreated = 0;
    let error: string | undefined;

    try {
      console.log(`Running data source: ${dataSource.name} (${dataSource.id})`);

      // Load definition file
      const fileRecord = await File.findById(dataSource.definition_file_id);
      if (!fileRecord) {
        throw new Error(
          `Definition file not found: ${dataSource.definition_file_id}`,
        );
      }

      // Extract definition content
      const { instructions, codeFiles } =
        await extractDefinitionContent(fileRecord);

      // Build system prompt
      const systemPrompt = `You are a data source execution agent. Your task is to:
1. Execute the provided code and instructions
2. Gather information from external sources (APIs, websites, databases, etc.)
3. Extract knowledge and facts from the gathered information
4. Store the facts into the Knowledge Plane using the available MCP tools

You have access to MCP tools that allow you to:
- facts.write: Write individual facts
- facts.bulkwrite: Write multiple facts at once
- fact_relations.create: Create relationships between facts

Instructions:
${instructions}

${codeFiles.length > 0 ? `\nCode files available:\n${codeFiles.map((f) => `\n## ${f.filename}\n\`\`\`\n${f.content}\n\`\`\``).join("\n")}` : ""}

Execute the code and instructions, gather data, and store relevant facts into the Knowledge Plane.`;

      // Build user prompt
      const userPrompt = `Execute the data source "${dataSource.name}" and store the gathered knowledge as facts in the Knowledge Plane.

${codeFiles.length > 0 ? "You can execute the provided code files. Use code interpretation capabilities if needed." : ""}

Make sure to:
1. Execute any code or scripts provided
2. Gather information from the specified sources
3. Extract meaningful facts
4. Store facts using the MCP tools (facts.write or facts.bulkwrite)
5. Create relationships between related facts if applicable`;

      // Get MCP server URL
      const mcpServerUrl = getMcpServerUrl(dataSource.workspace_id);

      // Call AI model with MCP tools
      const provider = this.aiClient.getProvider();
      const messages: ChatMessage[] = [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ];

      const chatOptions: ChatCompletionOptions = {
        model:
          process.env.OPENAI_MODEL || process.env.ANTHROPIC_MODEL || "gpt-4o",
        temperature: 0.7,
        maxTokens: 4000,
        mcpTools: [
          {
            type: "mcp",
            server_label: "KnowledgePlane",
            server_description: "Knowledge base with facts and knowledge cards",
            server_url: mcpServerUrl,
            require_approval: "never",
          },
        ],
      };

      // Enable code interpretation if available
      // Note: This depends on the AI provider supporting code interpretation
      // OpenAI's o1 models support this, but we'll use the standard API for now

      const response = await provider.chatCompletion(messages, chatOptions);

      // Extract fact count from response if possible
      // The model should report how many facts it created
      const responseText = response.content || "";
      const factCountMatch = responseText.match(/(\d+)\s+facts?\s+created/i);
      if (factCountMatch) {
        factsCreated = parseInt(factCountMatch[1], 10);
      }

      // Update data source with last run time and calculate next run
      const parsedSchedule = parseSchedule(dataSource.schedule);
      const nextRunAt = calculateNextRun(
        parsedSchedule,
        dataSource.last_run_at,
      );

      await DataSource.update(dataSource.id, {
        last_run_at: new Date().toISOString(),
        next_run_at: nextRunAt,
      });

      // Create success log
      const executionTime = Date.now() - startTime;
      await WorkerLog.create({
        worker_name: "data-source-runner",
        task_type: "data-source-execution",
        workspace_id: dataSource.workspace_id,
        status: "success",
        message: `Successfully executed data source: ${dataSource.name}`,
        execution_time_ms: executionTime,
        items_processed: 1,
        items_created: factsCreated,
      });

      console.log(`Data source ${dataSource.name} executed successfully`);
    } catch (err: any) {
      error = err.message || String(err);
      const executionTime = Date.now() - startTime;

      // Update data source with last run time (even on error)
      const parsedSchedule = parseSchedule(dataSource.schedule);
      const nextRunAt = calculateNextRun(
        parsedSchedule,
        dataSource.last_run_at,
      );

      await DataSource.update(dataSource.id, {
        last_run_at: new Date().toISOString(),
        next_run_at: nextRunAt,
      });

      await WorkerLog.create({
        worker_name: "data-source-runner",
        task_type: "data-source-execution",
        workspace_id: dataSource.workspace_id,
        status: "error",
        message: `Failed to execute data source: ${dataSource.name}`,
        execution_time_ms: executionTime,
        items_processed: 1,
        items_created: factsCreated,
        error: error,
      });

      throw err;
    }
  }
}
