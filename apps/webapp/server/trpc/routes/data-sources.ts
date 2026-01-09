import { router, protectedProcedure } from "../router";
import { DataSource, File, WorkspaceMember, WorkerLog, type WorkerLogRecord } from "@knowledgeplane/db/next";
import { z } from "zod";
import { Buffer } from "node:buffer";
import * as path from "node:path";

export const dataSourcesRouter = router({
  create: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1).max(100),
        description: z.string().max(500).optional(),
        schedule: z.string().min(1), // Cron expression or interval
        definition_file: z.object({
          filename: z.string(),
          mimeType: z.string(),
          data: z.string(), // Base64 encoded
        }),
        enabled: z.boolean().default(true),
        secrets: z.record(z.string(), z.string()).optional(), // Key-value pairs for secrets
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (!ctx.workspaceId) {
        throw new Error("Workspace ID is required");
      }

      // Validate workspace membership
      const member = await WorkspaceMember.findByWorkspaceAndUser(
        ctx.workspaceId,
        ctx.user.userId,
      );
      if (!member) {
        throw new Error("You are not a member of this workspace");
      }
      if (member.role !== "owner" && member.role !== "admin") {
        throw new Error("Only owners and admins can create data sources");
      }

      // Decode base64 data
      const buffer = Buffer.from(input.definition_file.data, "base64");
      const ext = path.extname(input.definition_file.filename).toLowerCase();

      // Prepare file metadata
      let fileMetadata: Record<string, any> = {
        original_filename: input.definition_file.filename,
        is_data_source_definition: true,
      };

      // Handle different file types
      if (ext === ".md" || ext === ".txt") {
        // Store content as text
        fileMetadata.content = buffer.toString("utf-8");
      } else if (ext === ".zip") {
        // Store zip content as base64 - extraction will happen in the worker
        fileMetadata.zip_content = input.definition_file.data;
        fileMetadata.is_zip = true;
      } else {
        throw new Error(`Unsupported file type: ${ext}. Only .md, .txt, and .zip files are supported.`);
      }

      // Create file record
      const fileRecord = await File.create({
        filename: input.definition_file.filename,
        original_filename: input.definition_file.filename,
        mime_type: input.definition_file.mimeType,
        size: buffer.length,
        storage_path: "", // No local storage
        workspace_id: ctx.workspaceId,
        uploaded_by: ctx.user.userId,
        metadata: fileMetadata,
      });

      // Create data source
      const dataSource = await DataSource.create({
        name: input.name,
        workspace_id: ctx.workspaceId,
        description: input.description,
        schedule: input.schedule,
        definition_file_id: fileRecord.id,
        enabled: input.enabled,
        created_by: ctx.user.userId,
        secrets: input.secrets || {},
      });

      return dataSource;
    }),

  list: protectedProcedure
    .input(
      z
        .object({
          limit: z.number().min(1).max(100).default(50),
          offset: z.number().min(0).default(0),
        })
        .optional(),
    )
    .query(async ({ ctx, input }) => {
      if (!ctx.workspaceId) {
        throw new Error("Workspace ID is required");
      }

      // Validate workspace membership
      const member = await WorkspaceMember.findByWorkspaceAndUser(
        ctx.workspaceId,
        ctx.user.userId,
      );
      if (!member) {
        throw new Error("You are not a member of this workspace");
      }

      const limit = input?.limit || 50;
      const offset = input?.offset || 0;
      const dataSources = await DataSource.list(ctx.workspaceId, limit, offset);
      const total = await DataSource.count(ctx.workspaceId);

      return { dataSources, total, limit, offset };
    }),

  getById: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      if (!ctx.workspaceId) {
        throw new Error("Workspace ID is required");
      }

      // Validate workspace membership
      const member = await WorkspaceMember.findByWorkspaceAndUser(
        ctx.workspaceId,
        ctx.user.userId,
      );
      if (!member) {
        throw new Error("You are not a member of this workspace");
      }

      const dataSource = await DataSource.findById(input.id);
      if (!dataSource) {
        throw new Error("Data source not found");
      }

      if (dataSource.workspace_id !== ctx.workspaceId) {
        throw new Error("Data source does not belong to this workspace");
      }

      // Load definition file
      const definitionFile = await File.findById(dataSource.definition_file_id);

      return {
        ...dataSource,
        definition_file: definitionFile,
      };
    }),

  update: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        name: z.string().min(1).max(100).optional(),
        description: z.string().max(500).optional(),
        schedule: z.string().min(1).optional(),
        enabled: z.boolean().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (!ctx.workspaceId) {
        throw new Error("Workspace ID is required");
      }

      const { id, ...updates } = input;

      // Validate workspace membership
      const member = await WorkspaceMember.findByWorkspaceAndUser(
        ctx.workspaceId,
        ctx.user.userId,
      );
      if (!member) {
        throw new Error("You are not a member of this workspace");
      }
      if (member.role !== "owner" && member.role !== "admin") {
        throw new Error("Only owners and admins can update data sources");
      }

      const dataSource = await DataSource.findById(id);
      if (!dataSource) {
        throw new Error("Data source not found");
      }

      if (dataSource.workspace_id !== ctx.workspaceId) {
        throw new Error("Data source does not belong to this workspace");
      }

      return await DataSource.update(id, updates);
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      if (!ctx.workspaceId) {
        throw new Error("Workspace ID is required");
      }

      // Validate workspace membership
      const member = await WorkspaceMember.findByWorkspaceAndUser(
        ctx.workspaceId,
        ctx.user.userId,
      );
      if (!member) {
        throw new Error("You are not a member of this workspace");
      }
      if (member.role !== "owner" && member.role !== "admin") {
        throw new Error("Only owners and admins can delete data sources");
      }

      const dataSource = await DataSource.findById(input.id);
      if (!dataSource) {
        throw new Error("Data source not found");
      }

      if (dataSource.workspace_id !== ctx.workspaceId) {
        throw new Error("Data source does not belong to this workspace");
      }

      await DataSource.delete(input.id);
      return { success: true };
    }),

  trigger: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      if (!ctx.workspaceId) {
        throw new Error("Workspace ID is required");
      }

      // Validate workspace membership
      const member = await WorkspaceMember.findByWorkspaceAndUser(
        ctx.workspaceId,
        ctx.user.userId,
      );
      if (!member) {
        throw new Error("You are not a member of this workspace");
      }

      const dataSource = await DataSource.findById(input.id);
      if (!dataSource) {
        throw new Error("Data source not found");
      }

      if (dataSource.workspace_id !== ctx.workspaceId) {
        throw new Error("Data source does not belong to this workspace");
      }

      // Set next_run_at to now to trigger immediate execution
      await DataSource.update(input.id, {
        next_run_at: new Date().toISOString(),
      });

      return { success: true };
    }),

  stop: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      if (!ctx.workspaceId) {
        throw new Error("Workspace ID is required");
      }

      // Validate workspace membership
      const member = await WorkspaceMember.findByWorkspaceAndUser(
        ctx.workspaceId,
        ctx.user.userId,
      );
      if (!member) {
        throw new Error("You are not a member of this workspace");
      }
      if (member.role !== "owner" && member.role !== "admin") {
        throw new Error("Only owners and admins can stop data sources");
      }

      const dataSource = await DataSource.findById(input.id);
      if (!dataSource) {
        throw new Error("Data source not found");
      }

      if (dataSource.workspace_id !== ctx.workspaceId) {
        throw new Error("Data source does not belong to this workspace");
      }

      // Find the latest running log for this data source
      const runningLog = await WorkerLog.findLatestRunning(input.id);
      if (!runningLog) {
        throw new Error("No running execution found for this data source");
      }

      // Update the log to error status with cancellation message
      const executionTime = Date.now() - new Date(runningLog.created_at).getTime();

      await WorkerLog.update(runningLog.id, {
        status: "error",
        message: `Data source execution cancelled by user`,
        execution_time_ms: executionTime,
        error: "Execution was cancelled by user",
        details: {
          ...(runningLog.details || {}),
          cancelled: true,
          cancelled_at: new Date().toISOString(),
          cancelled_by: ctx.user.userId,
        },
      });

      return { success: true };
    }),

  getLogs: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        limit: z.number().min(1).max(100).default(20),
        offset: z.number().min(0).default(0),
      }),
    )
    .query(async ({ ctx, input }) => {
      if (!ctx.workspaceId) {
        throw new Error("Workspace ID is required");
      }

      // Validate workspace membership
      const member = await WorkspaceMember.findByWorkspaceAndUser(
        ctx.workspaceId,
        ctx.user.userId,
      );
      if (!member) {
        throw new Error("You are not a member of this workspace");
      }

      const dataSource = await DataSource.findById(input.id);
      if (!dataSource) {
        throw new Error("Data source not found");
      }

      if (dataSource.workspace_id !== ctx.workspaceId) {
        throw new Error("Data source does not belong to this workspace");
      }

      const limit = input.limit || 20;
      const offset = input.offset || 0;
      const logs = await WorkerLog.list(
        ctx.workspaceId,
        limit,
        offset,
        "data-source-runner",
        undefined,
        input.id,
      );
      const total = await WorkerLog.count(
        ctx.workspaceId,
        "data-source-runner",
        undefined,
        input.id,
      );

      return { logs, total, limit, offset };
    }),

  checkRunningStatus: protectedProcedure
    .input(
      z.object({
        ids: z.array(z.string()),
      }),
    )
    .query(async ({ ctx, input }) => {
      if (!ctx.workspaceId) {
        throw new Error("Workspace ID is required");
      }

      // Validate workspace membership
      const member = await WorkspaceMember.findByWorkspaceAndUser(
        ctx.workspaceId,
        ctx.user.userId,
      );
      if (!member) {
        throw new Error("You are not a member of this workspace");
      }

      // Check running status for each data source
      const runningStatus: Record<string, boolean> = {};
      const runningLogs: Record<string, WorkerLogRecord | null> = {};

      for (const id of input.ids) {
        const dataSource = await DataSource.findById(id);
        if (dataSource && dataSource.workspace_id === ctx.workspaceId) {
          const runningLog = await WorkerLog.findLatestRunning(id);
          runningStatus[id] = runningLog !== null;
          runningLogs[id] = runningLog;
        }
      }

      return { runningStatus, runningLogs };
    }),

  addSecret: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        key: z.string().min(1).max(100),
        value: z.string().min(1),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (!ctx.workspaceId) {
        throw new Error("Workspace ID is required");
      }

      // Validate workspace membership
      const member = await WorkspaceMember.findByWorkspaceAndUser(
        ctx.workspaceId,
        ctx.user.userId,
      );
      if (!member) {
        throw new Error("You are not a member of this workspace");
      }
      if (member.role !== "owner" && member.role !== "admin") {
        throw new Error("Only owners and admins can manage secrets");
      }

      const dataSource = await DataSource.findById(input.id);
      if (!dataSource) {
        throw new Error("Data source not found");
      }

      if (dataSource.workspace_id !== ctx.workspaceId) {
        throw new Error("Data source does not belong to this workspace");
      }

      // Merge the new secret into existing secrets
      const updatedSecrets = {
        ...(dataSource.secrets || {}),
        [input.key]: input.value,
      };

      const updated = await DataSource.update(input.id, {
        secrets: updatedSecrets,
      });

      return updated;
    }),

  updateSecret: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        key: z.string().min(1).max(100),
        value: z.string().min(1),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (!ctx.workspaceId) {
        throw new Error("Workspace ID is required");
      }

      // Validate workspace membership
      const member = await WorkspaceMember.findByWorkspaceAndUser(
        ctx.workspaceId,
        ctx.user.userId,
      );
      if (!member) {
        throw new Error("You are not a member of this workspace");
      }
      if (member.role !== "owner" && member.role !== "admin") {
        throw new Error("Only owners and admins can manage secrets");
      }

      const dataSource = await DataSource.findById(input.id);
      if (!dataSource) {
        throw new Error("Data source not found");
      }

      if (dataSource.workspace_id !== ctx.workspaceId) {
        throw new Error("Data source does not belong to this workspace");
      }

      // Check if secret exists
      if (!dataSource.secrets || !(input.key in dataSource.secrets)) {
        throw new Error(`Secret key "${input.key}" does not exist`);
      }

      // Update the secret
      const updatedSecrets = {
        ...(dataSource.secrets || {}),
        [input.key]: input.value,
      };

      const updated = await DataSource.update(input.id, {
        secrets: updatedSecrets,
      });

      return updated;
    }),

  deleteSecret: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        key: z.string().min(1).max(100),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (!ctx.workspaceId) {
        throw new Error("Workspace ID is required");
      }

      // Validate workspace membership
      const member = await WorkspaceMember.findByWorkspaceAndUser(
        ctx.workspaceId,
        ctx.user.userId,
      );
      if (!member) {
        throw new Error("You are not a member of this workspace");
      }
      if (member.role !== "owner" && member.role !== "admin") {
        throw new Error("Only owners and admins can manage secrets");
      }

      const dataSource = await DataSource.findById(input.id);
      if (!dataSource) {
        throw new Error("Data source not found");
      }

      if (dataSource.workspace_id !== ctx.workspaceId) {
        throw new Error("Data source does not belong to this workspace");
      }

      // Remove the secret key
      const updatedSecrets = { ...(dataSource.secrets || {}) };
      delete updatedSecrets[input.key];

      const updated = await DataSource.update(input.id, {
        secrets: updatedSecrets,
      });

      return updated;
    }),
});

