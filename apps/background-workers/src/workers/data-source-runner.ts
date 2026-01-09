import {
  DataSource,
  File,
  WorkerLog,
  collections,
  Fact,
} from "@knowledgeplane/db";
import {
  createAIModelClient,
  type ChatMessage,
  type ChatCompletionOptions,
  type Tool,
} from "@knowledgeplane/aimodel";
import { randomUUID } from "node:crypto";
import * as path from "node:path";
import { Buffer } from "node:buffer";
import * as vm from "node:vm";

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

/**
 * Execute code in a sandboxed VM with secrets and facts API
 */
async function executeCodeInVM(args: {
  code: string;
  secrets?: Record<string, string>;
  workspace_id: string;
  created_by?: string;
  timeout?: number;
  running_log_id?: string;
}): Promise<{
  success: boolean;
  result: any;
  error: any;
  consoleOutput?: string[];
}> {
  const timeout = Math.min(args.timeout || 30000, 300000); // Max 5 minutes
  const userId = args.created_by || "system";
  const secrets = args.secrets || {};
  const workspaceId = args.workspace_id;
  const runningLogId = args.running_log_id;

  // Create AI model client for embeddings (needed for fact search)
  const client = createAIModelClient(
    (process.env.AI_PROVIDER as any) || "openai",
    process.env.OPENAI_API_KEY || process.env.ANTHROPIC_API_KEY,
  );
  const provider = client.getProvider();

  // Collect console output
  const consoleOutput: string[] = [];
  const consoleLog = (...args: any[]) => {
    consoleOutput.push(
      args
        .map((arg) => {
          if (typeof arg === "object") {
            try {
              return JSON.stringify(arg, null, 2);
            } catch {
              return String(arg);
            }
          }
          return String(arg);
        })
        .join(" "),
    );
  };

  // Create progress logging function
  // Creates new log entries instead of updating existing ones
  const logProgress = async (
    message: string,
    metadata?: Record<string, any>,
  ) => {
    if (!runningLogId) return;

    try {
      // Get the original running log to get context
      const runningLog = await WorkerLog.findById(runningLogId);
      if (!runningLog) return;

      // Create a new log entry for this progress update
      await WorkerLog.create({
        worker_name: runningLog.worker_name,
        task_type: runningLog.task_type,
        workspace_id: runningLog.workspace_id,
        data_source_id: runningLog.data_source_id,
        status: "running",
        message: message,
        details: {
          ...(metadata && { metadata }),
          progress: true, // Mark this as a progress log
          parent_log_id: runningLogId, // Reference to the main execution log
        },
      });
    } catch (err) {
      // Silently fail to not interrupt script execution
      console.error("Failed to log progress:", err);
    }
  };

  // Create facts API object for the execution context
  const factsAPI = {
    create: async (content: string | { content?: string; metadata?: Record<string, string> }, metadata?: Record<string, string>) => {
      // Handle case where first parameter is an object (common mistake)
      let actualContent: string;
      let actualMetadata: Record<string, string> | undefined;
      
      if (typeof content === "object" && content !== null && !Array.isArray(content)) {
        // First parameter is an object - extract content and metadata
        actualContent = typeof content.content === "string" ? content.content : JSON.stringify(content);
        actualMetadata = content.metadata || metadata;
      } else if (typeof content === "string") {
        // Normal case: first parameter is a string
        actualContent = content;
        actualMetadata = metadata;
      } else {
        // Fallback: convert to string
        actualContent = String(content);
        actualMetadata = metadata;
      }
      
      const fact = await Fact.write({
        content: actualContent,
        metadata: actualMetadata,
        workspace_id: workspaceId,
        created_by: userId,
        last_updated_by: userId,
      });
      return fact;
    },
    bulkCreate: async (
      facts: Array<{ content: string; metadata?: Record<string, string> }>,
    ) => {
      const factInputs = facts.map((f) => {
        // Ensure content is always a string
        let content: string;
        if (typeof f.content === "string") {
          content = f.content;
        } else if (typeof f.content === "object" && f.content !== null) {
          // If content is an object, try to extract string content or stringify
          content = typeof (f.content as any).content === "string" 
            ? (f.content as any).content 
            : JSON.stringify(f.content);
        } else {
          content = String(f.content);
        }
        
        return {
          content,
          metadata: f.metadata,
          workspace_id: workspaceId,
          created_by: userId,
          last_updated_by: userId,
        };
      });
      const result = await Fact.bulkWrite(factInputs);
      return result;
    },
    update: async (
      id: string,
      updates: { content?: string; metadata?: Record<string, string> },
    ) => {
      const fact = await Fact.update({
        id,
        content: updates.content,
        metadata: updates.metadata,
        last_updated_by: userId,
      });
      return fact;
    },
    delete: async (id: string) => {
      const fact = await Fact.trash(id, userId);
      return fact;
    },
    query: async (params: {
      query: string;
      k?: number;
      offset?: number;
      include_trashed?: boolean;
    }) => {
      const hits = await Fact.search({
        query: params.query,
        workspace_id: workspaceId,
        k: params.k || 5,
        offset: params.offset || 0,
        include_trashed: params.include_trashed || false,
        use_vector_search: undefined, // Use hybrid search
        embeddingProvider: provider,
      });
      return hits;
    },
  };

  // Create VM context with secrets and facts API
  const vmContext = vm.createContext({
    secrets,
    facts: factsAPI,
    logProgress, // Progress logging function for scripts
    console: {
      log: consoleLog,
      error: consoleLog,
      warn: consoleLog,
      info: consoleLog,
    },
    // Provide fetch for HTTP requests (Node.js 18+)
    fetch: globalThis.fetch,
    // Provide some common utilities
    setTimeout: setTimeout,
    clearTimeout: clearTimeout,
    setInterval: setInterval,
    clearInterval: clearInterval,
    // Provide JSON utilities
    JSON,
    // Provide Math utilities
    Math,
    // Provide Date utilities
    Date,
    // Provide Promise (for async/await support)
    Promise,
    // Provide Array, Object, String, Number constructors
    Array,
    Object,
    String,
    Number,
    Boolean,
    RegExp,
    Error,
    TypeError,
    ReferenceError,
    SyntaxError,
    // Provide Buffer for binary data
    Buffer: globalThis.Buffer,
    // Provide URL and URLSearchParams for URL manipulation
    URL: globalThis.URL,
    URLSearchParams: globalThis.URLSearchParams,
    // Provide require stub with helpful error message
    require: () => {
      throw new Error(
        "require() is not available in the sandboxed execution environment. " +
        "All necessary APIs (fetch, Buffer, URL, etc.) are already available in the global scope. " +
        "Use the provided APIs directly without requiring modules."
      );
    },
    // Provide module stub to prevent "module is not defined" errors
    module: {
      exports: {},
      require: () => {
        throw new Error(
          "require() is not available in the sandboxed execution environment. " +
          "All necessary APIs (fetch, Buffer, URL, etc.) are already available in the global scope."
        );
      },
    },
  });

  // Wrap code in async function to support top-level await
  const wrappedCode = `
    (async () => {
      ${args.code}
    })()
  `;

  let result: any;
  let error: Error | null = null;

  try {
    // Create VM script
    const vmInstance = new vm.Script(wrappedCode);

    // Run the script in the context with timeout
    const vmResult = vmInstance.runInContext(vmContext, {
      timeout,
    });

    // If the result is a Promise, await it with timeout
    if (vmResult && typeof vmResult.then === "function") {
      result = await Promise.race([
        vmResult,
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error("Execution timeout")), timeout),
        ),
      ]);
    } else {
      result = vmResult;
    }
  } catch (err: any) {
    error = err;
  }

  return {
    success: !error,
    result: result !== undefined ? result : null,
    error: error
      ? {
          message: error.message,
          name: error.name,
          stack: error.stack,
        }
      : null,
    consoleOutput: consoleOutput.length > 0 ? consoleOutput : undefined,
  };
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
    // Check for data sources to run every 5 seconds for faster response to manual triggers
    this.interval = setInterval(() => {
      this.process().catch((error) => {
        console.error("Error in data source runner:", error);
      });
    }, 5 * 1000);

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
        console.log("No data sources ready for execution");
        return;
      }

      console.log(`Processing ${dataSources.length} data source(s)`);
      for (const ds of dataSources) {
        console.log(
          `  - ${ds.name} (${ds.id}) - enabled: ${ds.enabled}, next_run_at: ${ds.next_run_at || "null"}`,
        );
      }

      for (const dataSource of dataSources) {
        try {
          console.log(
            `Starting execution of data source: ${dataSource.name} (${dataSource.id})`,
          );
          await this.runDataSource(dataSource);
          console.log(
            `Completed execution of data source: ${dataSource.name} (${dataSource.id})`,
          );
        } catch (error: any) {
          console.error(`Error running data source ${dataSource.id}:`, error);
          await WorkerLog.create({
            worker_name: "data-source-runner",
            task_type: "data-source-execution",
            workspace_id: dataSource.workspace_id,
            data_source_id: dataSource.id,
            status: "error",
            message: `Failed to run data source: ${dataSource.name}`,
            execution_time_ms: Date.now() - startTime,
            error: error.message || String(error),
          });
        }
      }
    } catch (error: any) {
      console.error("Error in data source runner process:", error);
    } finally {
      this.running = false;
    }
  }

  /**
   * Check if execution has been cancelled by checking the log status
   */
  private async checkCancellation(logId: string): Promise<void> {
    if (!logId) return;

    try {
      const log = await WorkerLog.findById(logId);
      if (!log) return;

      // Check if log status changed from "running" to something else
      if (log.status !== "running") {
        // Check if it was cancelled (either via details.cancelled flag or error message)
        const cancelled =
          log.details?.cancelled === true ||
          log.error?.toLowerCase().includes("cancelled") ||
          log.message?.toLowerCase().includes("cancelled");

        if (cancelled) {
          throw new Error("Execution was cancelled by user");
        }

        // If status changed but not cancelled, it might have been updated externally
        // Still throw to stop execution
        throw new Error(
          `Execution stopped: log status changed to ${log.status}`,
        );
      }
    } catch (error: any) {
      // If error is cancellation or stop, rethrow it
      if (
        error.message?.includes("cancelled") ||
        error.message?.includes("stopped")
      ) {
        throw error;
      }
      // Otherwise, ignore errors checking cancellation (log might not exist yet)
    }
  }

  private async runDataSource(dataSource: any) {
    const startTime = Date.now();
    let factsCreated = 0;
    let error: string | undefined;
    let runningLogId: string | undefined;
    let hasCodeExecutionError = false; // Track if any code execution failed
    let codeExecutionError: string | undefined; // Store the first code execution error

    try {
      // Log that execution has started
      console.log(
        `Creating initial log for data source: ${dataSource.name} (${dataSource.id})`,
      );
      const runningLog = await WorkerLog.create({
        worker_name: "data-source-runner",
        task_type: "data-source-execution",
        workspace_id: dataSource.workspace_id,
        data_source_id: dataSource.id,
        status: "running",
        message: `Starting execution of data source: ${dataSource.name}`,
        details: { stage: "initialization" },
      });
      runningLogId = runningLog.id;
      console.log(
        `Created log entry: ${runningLogId} for data source: ${dataSource.name}`,
      );
    } catch (logError: any) {
      console.error(
        `Failed to create initial log for data source ${dataSource.id}:`,
        logError,
      );
      // Continue execution even if log creation fails
    }

    try {
      console.log(`Running data source: ${dataSource.name} (${dataSource.id})`);

      // Create log: Loading definition file
      if (runningLogId) {
        await WorkerLog.create({
          worker_name: "data-source-runner",
          task_type: "data-source-execution",
          workspace_id: dataSource.workspace_id,
          data_source_id: dataSource.id,
          status: "running",
          message: `Loading definition file for data source: ${dataSource.name}`,
          details: {
            stage: "loading_definition_file",
            parent_log_id: runningLogId,
          },
        });
      }

      // Load definition file
      const fileRecord = await File.findById(dataSource.definition_file_id);
      if (!fileRecord) {
        throw new Error(
          `Definition file not found: ${dataSource.definition_file_id}`,
        );
      }

      // Create log: Extracting content
      if (runningLogId) {
        await WorkerLog.create({
          worker_name: "data-source-runner",
          task_type: "data-source-execution",
          workspace_id: dataSource.workspace_id,
          data_source_id: dataSource.id,
          status: "running",
          message: `Extracting definition content from file: ${fileRecord.original_filename || fileRecord.filename}`,
          details: {
            stage: "extracting_content",
            filename: fileRecord.original_filename || fileRecord.filename,
            parent_log_id: runningLogId,
          },
        });
      }

      // Check for cancellation before continuing
      if (runningLogId) {
        await this.checkCancellation(runningLogId);
      }

      // Extract definition content
      const { instructions, codeFiles } =
        await extractDefinitionContent(fileRecord);

      // Check for cancellation after extraction
      if (runningLogId) {
        await this.checkCancellation(runningLogId);
      }

      // Create log: Preparing AI execution
      if (runningLogId) {
        await WorkerLog.create({
          worker_name: "data-source-runner",
          task_type: "data-source-execution",
          workspace_id: dataSource.workspace_id,
          data_source_id: dataSource.id,
          status: "running",
          message: `Preparing AI execution for data source: ${dataSource.name}`,
          details: {
            stage: "preparing_ai_execution",
            codeFilesCount: codeFiles.length,
            parent_log_id: runningLogId,
          },
        });
      }

      // Build system prompt
      const systemPrompt = `You are a data source execution agent. Your task is to:
1. Execute the provided code and instructions
2. Gather information from external sources (APIs, websites, databases, etc.)
3. Extract knowledge and facts from the gathered information
4. Store the facts into the Knowledge Plane using the code_execute tool

You have access to the code_execute tool which executes JavaScript/TypeScript code in a sandboxed VM environment.

When using code_execute:
- The execution context includes: secrets (from data source), facts API, console for logging, and logProgress for custom progress logging
- IMPORTANT: \`require()\` and \`import\` statements are NOT available. All necessary APIs (fetch, Buffer, URL, JSON, Math, Date, etc.) are already available in the global scope.
- Secrets are automatically available in the execution context as \`secrets\` object
- Facts API is available as \`facts\` object with the following methods:
  - facts.create(content, metadata?): Create a single fact
  - facts.bulkCreate(facts[]): Create multiple facts at once (each fact has content and optional metadata)
  - facts.update(id, updates): Update a fact (updates can include content and/or metadata)
  - facts.delete(id): Delete (trash) a fact
  - facts.query(params): Query/search facts (params: { query: string, k?: number, offset?: number, include_trashed?: boolean })
- Progress logging is available via \`logProgress(message, metadata?)\` function:
  - logProgress(message: string, metadata?: object): Log a custom progress message that will be stored and displayed in the execution logs
  - Example: await logProgress("Processing item 5 of 10", { item: 5, total: 10 })
  - Progress messages are stored with timestamps and displayed in the UI alongside other log information
- Use async/await for asynchronous operations
- The code can return values or use console.log for debugging
- All facts operations automatically use the workspace_id and user_id from the data source context

Instructions:
${instructions}

${codeFiles.length > 0 ? `\nCode files available:\n${codeFiles.map((f) => `\n## ${f.filename}\n\`\`\`\n${f.content}\n\`\`\``).join("\n")}` : ""}

Execute the code and instructions, gather data, and store relevant facts into the Knowledge Plane using the facts API available in the code execution context.`;

      // Build user prompt
      const userPrompt = `Execute the data source "${dataSource.name}" and store the gathered knowledge as facts in the Knowledge Plane.

${codeFiles.length > 0 ? "Execute the provided code files using the code_execute tool. The code should use the facts API available in the execution context to store facts." : ""}

${dataSource.secrets && Object.keys(dataSource.secrets).length > 0 ? `\nSecrets available for this data source: ${Object.keys(dataSource.secrets).join(", ")}\nThese secrets are automatically available in the code execution context as the \`secrets\` object.` : ""}

Make sure to:
1. Execute any code or scripts provided using the code_execute tool
2. Gather information from the specified sources
3. Extract meaningful facts
4. Store facts using the facts API available in the execution context (facts.create, facts.bulkCreate, etc.)
5. Use the facts.query method to check for existing facts before creating duplicates if needed`;

      // Call AI model with code_execute function tool only
      const provider = this.aiClient.getProvider();
      const messages: ChatMessage[] = [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ];

      // Create code_execute function tool
      const codeExecuteTool: Tool = {
        type: "function",
        function: {
          name: "code_execute",
          description:
            "Execute JavaScript/TypeScript code in a sandboxed VM environment. The execution context includes: secrets (key-value pairs), facts API (create, bulkCreate, update, delete, query), and console for logging. The code should use the facts API to store facts into the Knowledge Plane. Returns the result of the last expression or the return value.",
          parameters: {
            type: "object",
            properties: {
              code: {
                type: "string",
                description:
                  "JavaScript/TypeScript code to execute. The code should use the facts API (available as 'facts' object) to create, update, delete, or query facts. Secrets are available as 'secrets' object.",
              },
              secrets: {
                type: "object",
                description:
                  "Optional additional secrets to make available in the execution context (secrets from data source are automatically included)",
                additionalProperties: { type: "string" },
              },
              timeout: {
                type: "number",
                description:
                  "Execution timeout in milliseconds (default: 30000, max: 300000)",
              },
            },
            required: ["code"],
          },
        },
      };

      const chatOptions: ChatCompletionOptions = {
        model:
          process.env.OPENAI_MODEL || process.env.ANTHROPIC_MODEL || "gpt-4o",
        temperature: 0.7,
        maxTokens: 4000,
        tools: [codeExecuteTool],
      };

      // Create log: Starting AI execution
      if (runningLogId) {
        await WorkerLog.create({
          worker_name: "data-source-runner",
          task_type: "data-source-execution",
          workspace_id: dataSource.workspace_id,
          data_source_id: dataSource.id,
          status: "running",
          message: `Starting AI execution for data source: ${dataSource.name}`,
          details: {
            stage: "ai_execution_started",
            parent_log_id: runningLogId,
          },
        });
      }

      // Check for cancellation before starting AI execution
      if (runningLogId) {
        await this.checkCancellation(runningLogId);
      }

      // Handle tool calls in a loop
      let response = await provider.chatCompletion(messages, chatOptions);
      const maxIterations = 10; // Prevent infinite loops
      let iterations = 0;

      while (
        response.toolCalls &&
        response.toolCalls.length > 0 &&
        iterations < maxIterations
      ) {
        iterations++;

        // Check for cancellation before each iteration
        if (runningLogId) {
          await this.checkCancellation(runningLogId);
        }

        // Create log: Processing tool calls
        if (runningLogId) {
          await WorkerLog.create({
            worker_name: "data-source-runner",
            task_type: "data-source-execution",
            workspace_id: dataSource.workspace_id,
            data_source_id: dataSource.id,
            status: "running",
            message: `Processing tool calls (iteration ${iterations}/${maxIterations}) for data source: ${dataSource.name}`,
            details: {
              stage: "processing_tool_calls",
              iteration: iterations,
              maxIterations,
              parent_log_id: runningLogId,
            },
          });
        }

        // Add assistant message with tool calls
        messages.push({
          role: "assistant",
          content: response.content || "",
        });

        // Process each tool call
        // Only code_execute function tool calls are handled here
        for (const toolCall of response.toolCalls) {
          if (toolCall.function.name === "code_execute") {
            try {
              // Check for cancellation before executing code
              if (runningLogId) {
                await this.checkCancellation(runningLogId);
              }

              // Create log: Executing code
              if (runningLogId) {
                await WorkerLog.create({
                  worker_name: "data-source-runner",
                  task_type: "data-source-execution",
                  workspace_id: dataSource.workspace_id,
                  data_source_id: dataSource.id,
                  status: "running",
                  message: `Executing code for data source: ${dataSource.name} (iteration ${iterations})`,
                  details: {
                    stage: "executing_code",
                    iteration: iterations,
                    parent_log_id: runningLogId,
                  },
                });
              }

              const args = JSON.parse(toolCall.function.arguments);
              const executionResult = await executeCodeInVM({
                code: args.code,
                secrets: args.secrets || dataSource.secrets || {},
                workspace_id: dataSource.workspace_id,
                created_by: dataSource.created_by || "system",
                timeout: args.timeout,
                running_log_id: runningLogId,
              });

              // Create log: Code execution completed or failed
              if (runningLogId) {
                if (executionResult.success) {
                  const consoleOutputCount =
                    executionResult.consoleOutput?.length || 0;
                  await WorkerLog.create({
                    worker_name: "data-source-runner",
                    task_type: "data-source-execution",
                    workspace_id: dataSource.workspace_id,
                    data_source_id: dataSource.id,
                    status: "running",
                    message: `Code execution completed for data source: ${dataSource.name} (iteration ${iterations})`,
                    details: {
                      stage: "code_execution_completed",
                      iteration: iterations,
                      consoleOutputLines: consoleOutputCount,
                      parent_log_id: runningLogId,
                    },
                  });
                } else {
                  // Log code execution failure as error
                  const errorMessage =
                    executionResult.error?.message ||
                    (typeof executionResult.error === "string"
                      ? executionResult.error
                      : JSON.stringify(executionResult.error)) ||
                    "Unknown error";

                  // Track that we had a code execution error
                  hasCodeExecutionError = true;
                  if (!codeExecutionError) {
                    codeExecutionError = errorMessage;
                  }

                  await WorkerLog.create({
                    worker_name: "data-source-runner",
                    task_type: "data-source-execution",
                    workspace_id: dataSource.workspace_id,
                    data_source_id: dataSource.id,
                    status: "error",
                    message: `Code execution failed for data source: ${dataSource.name} (iteration ${iterations})`,
                    error: errorMessage,
                    details: {
                      stage: "code_execution_error",
                      iteration: iterations,
                      error: executionResult.error,
                      consoleOutput: executionResult.consoleOutput,
                      parent_log_id: runningLogId,
                    },
                  });
                }
              }

              // Add tool result to messages
              messages.push({
                role: "user",
                content: `Tool call result for code_execute:\n${JSON.stringify(executionResult, null, 2)}`,
              });
            } catch (error: any) {
              // Track that we had a code execution error
              hasCodeExecutionError = true;
              const errorMessage = error.message || String(error);
              if (!codeExecutionError) {
                codeExecutionError = errorMessage;
              }

              // Create log: Code execution error (exception thrown)
              if (runningLogId) {
                await WorkerLog.create({
                  worker_name: "data-source-runner",
                  task_type: "data-source-execution",
                  workspace_id: dataSource.workspace_id,
                  data_source_id: dataSource.id,
                  status: "error",
                  message: `Code execution error for data source: ${dataSource.name} (iteration ${iterations})`,
                  error: errorMessage,
                  details: {
                    stage: "code_execution_error",
                    iteration: iterations,
                    error: error.message || String(error),
                    stack: error.stack,
                    parent_log_id: runningLogId,
                  },
                });
              }
              messages.push({
                role: "user",
                content: `Error executing code: ${error.message}`,
              });
            }
          }
        }

        // Check for cancellation before continuing
        if (runningLogId) {
          await this.checkCancellation(runningLogId);
        }

        // Continue the conversation
        response = await provider.chatCompletion(messages, chatOptions);
      }

      // Check for cancellation after AI execution completes
      if (runningLogId) {
        await this.checkCancellation(runningLogId);
      }

      // Create log: Extracting results
      if (runningLogId) {
        await WorkerLog.create({
          worker_name: "data-source-runner",
          task_type: "data-source-execution",
          workspace_id: dataSource.workspace_id,
          data_source_id: dataSource.id,
          status: "running",
          message: `Extracting execution results for data source: ${dataSource.name}`,
          details: { stage: "extracting_results", parent_log_id: runningLogId },
        });
      }

      // Extract fact count from response if possible
      // The model should report how many facts it created
      const responseText = response.content || "";
      const factCountMatch = responseText.match(/(\d+)\s+facts?\s+created/i);
      if (factCountMatch) {
        factsCreated = parseInt(factCountMatch[1], 10);
      }

      // Create completion log entry (append, don't update)
      // This ensures the execution is marked as complete even if schedule update hangs
      const executionTime = Date.now() - startTime;
      const finalStatus = hasCodeExecutionError ? "error" : "success";
      const finalMessage = hasCodeExecutionError
        ? `Data source execution completed with errors: ${dataSource.name}`
        : `Successfully executed data source: ${dataSource.name}`;

      if (runningLogId) {
        try {
          await WorkerLog.create({
            worker_name: "data-source-runner",
            task_type: "data-source-execution",
            workspace_id: dataSource.workspace_id,
            data_source_id: dataSource.id,
            status: finalStatus,
            message: finalMessage,
            execution_time_ms: executionTime,
            items_processed: 1,
            items_created: factsCreated,
            error: hasCodeExecutionError ? codeExecutionError : undefined,
            details: {
              stage: hasCodeExecutionError
                ? "completed_with_errors"
                : "completed",
              factsCreated,
              original_log_id: runningLogId,
              ...(hasCodeExecutionError && {
                hasCodeExecutionError: true,
                codeExecutionError: codeExecutionError,
              }),
            },
          });
          console.log(
            hasCodeExecutionError
              ? `Data source ${dataSource.name} executed with errors: ${codeExecutionError}`
              : `Data source ${dataSource.name} executed successfully`,
          );
        } catch (createError: any) {
          console.error(`Failed to create completion log:`, createError);
        }
      } else {
        // No running log ID, but still log the result
        console.log(
          hasCodeExecutionError
            ? `Data source ${dataSource.name} executed with errors: ${codeExecutionError}`
            : `Data source ${dataSource.name} executed successfully`,
        );
      }

      // Now update schedule (after main log is updated, so it doesn't block completion status)
      // This is done in a non-blocking way - if it fails, we've already marked execution as complete
      try {
        // Create log: Updating data source schedule
        // Note: This is a progress log, but the main log is already updated to final status
        // so the data source won't appear as "running" even if this log has "running" status
        if (runningLogId) {
          await WorkerLog.create({
            worker_name: "data-source-runner",
            task_type: "data-source-execution",
            workspace_id: dataSource.workspace_id,
            data_source_id: dataSource.id,
            status: "running", // Progress log - main log already has final status
            message: `Updating schedule for data source: ${dataSource.name}`,
            details: {
              stage: "updating_schedule",
              parent_log_id: runningLogId,
              note: "Main execution already marked as complete",
            },
          });
        }

        // Update data source with last run time and calculate next run
        const parsedSchedule = parseSchedule(dataSource.schedule);
        const nextRunAt = calculateNextRun(
          parsedSchedule,
          dataSource.last_run_at,
        );

        // Wrap update in timeout to prevent hanging
        const updateTimeout = 10000; // 10 seconds timeout
        await Promise.race([
          DataSource.update(dataSource.id, {
            last_run_at: new Date().toISOString(),
            next_run_at: nextRunAt,
          }),
          new Promise((_, reject) =>
            setTimeout(
              () => reject(new Error("DataSource.update timeout")),
              updateTimeout,
            ),
          ),
        ]);
        console.log(
          `Successfully updated schedule for data source: ${dataSource.name}`,
        );
      } catch (updateError: any) {
        console.error(
          `Failed to update schedule for data source ${dataSource.name} (${dataSource.id}):`,
          updateError,
        );
        // Log the error but don't fail the entire execution
        // The main log is already updated, so this is just a warning
        if (runningLogId) {
          try {
            await WorkerLog.create({
              worker_name: "data-source-runner",
              task_type: "data-source-execution",
              workspace_id: dataSource.workspace_id,
              data_source_id: dataSource.id,
              status: "error", // This is a warning about schedule update failure
              message: `Warning: Failed to update schedule for data source: ${dataSource.name}`,
              error: updateError.message || String(updateError),
              details: {
                stage: "schedule_update_warning",
                error: updateError.message || String(updateError),
                parent_log_id: runningLogId,
                note: "Schedule update failed but execution was already marked as complete",
              },
            });
          } catch (logError: any) {
            // Silently fail - we don't want to block on logging a warning
            console.error(`Failed to log schedule update warning:`, logError);
          }
        }
      }
    } catch (err: any) {
      error = err.message || String(err);
      const executionTime = Date.now() - startTime;
      const isCancelled =
        error?.includes("cancelled") || err.message?.includes("cancelled");

      if (isCancelled) {
        console.log(
          `Data source ${dataSource.name} (${dataSource.id}) execution was cancelled`,
        );
      } else {
        console.error(
          `Error executing data source ${dataSource.name} (${dataSource.id}):`,
          err,
        );
      }

      // Create error log entry (append, don't update)
      if (runningLogId) {
        try {
          await WorkerLog.create({
            worker_name: "data-source-runner",
            task_type: "data-source-execution",
            workspace_id: dataSource.workspace_id,
            data_source_id: dataSource.id,
            status: "error",
            message: isCancelled
              ? `Data source execution cancelled by user`
              : `Failed to execute data source: ${dataSource.name}`,
            execution_time_ms: executionTime,
            items_processed: 1,
            items_created: factsCreated,
            error: isCancelled ? "Execution was cancelled by user" : error,
            details: {
              stage: isCancelled ? "cancelled" : "error",
              error: error,
              cancelled: isCancelled,
              original_log_id: runningLogId,
            },
          });
        } catch (createError: any) {
          console.error(`Failed to create error log:`, createError);
        }
      } else {
        // If we don't have a running log ID, create a new error log
        try {
          await WorkerLog.create({
            worker_name: "data-source-runner",
            task_type: "data-source-execution",
            workspace_id: dataSource.workspace_id,
            data_source_id: dataSource.id,
            status: "error",
            message: isCancelled
              ? `Data source execution cancelled by user`
              : `Failed to execute data source: ${dataSource.name}`,
            execution_time_ms: executionTime,
            items_processed: 1,
            items_created: factsCreated,
            error: isCancelled ? "Execution was cancelled by user" : error,
            details: {
              stage: isCancelled ? "cancelled" : "error",
              error: error,
              cancelled: isCancelled,
            },
          });
        } catch (createError: any) {
          console.error(`Failed to create error log:`, createError);
        }
      }

      // Update data source with last run time (even on error)
      const parsedSchedule = parseSchedule(dataSource.schedule);
      const nextRunAt = calculateNextRun(
        parsedSchedule,
        dataSource.last_run_at,
      );

      // Wrap update in timeout to prevent hanging
      const updateTimeout = 10000; // 10 seconds timeout
      try {
        await Promise.race([
          DataSource.update(dataSource.id, {
            last_run_at: new Date().toISOString(),
            next_run_at: nextRunAt,
          }),
          new Promise((_, reject) =>
            setTimeout(
              () => reject(new Error("DataSource.update timeout")),
              updateTimeout,
            ),
          ),
        ]);
        console.log(
          `Successfully updated schedule for data source (error path): ${dataSource.name}`,
        );
      } catch (updateError: any) {
        console.error(
          `Failed to update schedule for data source ${dataSource.name} (${dataSource.id}) in error path:`,
          updateError,
        );
        // Continue to throw the original error even if schedule update fails
      }

      throw err;
    }
  }
}
