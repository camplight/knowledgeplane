"use client";

import { trpc } from "../../utils/trpc";
import { useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import { AppLayout } from "../components/AppLayout";

export default function WorkerLogsPage() {
  const router = useRouter();
  const [page, setPage] = useState(0);
  const [workerFilter, setWorkerFilter] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<"success" | "error" | "running" | "">("");
  const limit = 20;

  const { data: userData, isLoading: userLoading } = trpc.auth.me.useQuery();
  const { data: logsData, isLoading: logsLoading, refetch: refetchLogs } = trpc.workerLogs.list.useQuery({
    limit,
    offset: page * limit,
    worker_name: workerFilter || undefined,
    status: statusFilter || undefined,
  });

  const triggerWorker = trpc.workerLogs.trigger.useMutation({
    onSuccess: () => {
      // Refetch logs to show the new trigger log entry
      refetchLogs();
    },
    onError: (error) => {
      alert(`Failed to trigger worker: ${error.message}`);
    },
  });

  useEffect(() => {
    if (!userLoading && !userData?.user) {
      router.push("/");
    }
  }, [userLoading, userData, router]);

  if (userLoading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center min-h-screen">
          <span className="loading loading-spinner loading-lg"></span>
        </div>
      </AppLayout>
    );
  }

  if (!userData?.user) {
    return null;
  }

  const logs = logsData?.logs || [];
  const total = logsData?.total || 0;
  const totalPages = Math.ceil(total / limit);

  const getStatusBadgeColor = (status: string) => {
    switch (status) {
      case "success":
        return "badge-success";
      case "error":
        return "badge-error";
      case "running":
        return "badge-info";
      default:
        return "badge-ghost";
    }
  };

  const formatDuration = (ms?: number) => {
    if (!ms) return "N/A";
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(2)}s`;
    return `${(ms / 60000).toFixed(2)}m`;
  };

  return (
    <AppLayout>

      <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Background Worker Logs</h1>
            <p className="text-base-content/70 mt-2">
              View execution results and status of background worker tasks
            </p>
          </div>
          <div className="flex gap-3">
            <button
              onClick={() => triggerWorker.mutate({ worker: "card-consolidator" })}
              disabled={triggerWorker.isPending}
              className="btn btn-info"
            >
              {triggerWorker.isPending ? (
                <>
                  <span className="loading loading-spinner loading-sm"></span>
                  Triggering...
                </>
              ) : (
                "Trigger Card Consolidator"
              )}
            </button>
            <button
              onClick={() => triggerWorker.mutate({ worker: "embeddings-generator" })}
              disabled={triggerWorker.isPending}
              className="btn btn-secondary"
            >
              {triggerWorker.isPending ? (
                <>
                  <span className="loading loading-spinner loading-sm"></span>
                  Triggering...
                </>
              ) : (
                "Trigger Embeddings Generator"
              )}
            </button>
          </div>
        </div>

        {/* Filters */}
        <div className="card bg-base-100 shadow-xl mb-6">
          <div className="card-body">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="form-control">
                <label className="label">
                  <span className="label-text font-medium">Worker Name</span>
                </label>
                <input
                  type="text"
                  placeholder="Filter by worker name..."
                  value={workerFilter}
                  onChange={(e) => {
                    setWorkerFilter(e.target.value);
                    setPage(0);
                  }}
                  className="input input-bordered w-full"
                />
              </div>
              <div className="form-control">
                <label className="label">
                  <span className="label-text font-medium">Status</span>
                </label>
                <select
                  value={statusFilter}
                  onChange={(e) => {
                    setStatusFilter(e.target.value as any);
                    setPage(0);
                  }}
                  className="select select-bordered w-full"
                >
                  <option value="">All Statuses</option>
                  <option value="success">Success</option>
                  <option value="error">Error</option>
                  <option value="running">Running</option>
                </select>
              </div>
            </div>
          </div>
        </div>

        {/* Logs Table */}
        <div className="card bg-base-100 shadow-xl overflow-hidden">
          {logsLoading ? (
            <div className="p-8 text-center">
              <span className="loading loading-spinner loading-lg"></span>
              <p className="mt-4">Loading logs...</p>
            </div>
          ) : logs.length === 0 ? (
            <div className="p-8 text-center">
              <p className="text-lg font-medium mb-2">No logs found</p>
              <p className="text-base-content/70">Worker logs will appear here after tasks are executed</p>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="table table-zebra table-pin-rows">
                  <thead>
                    <tr>
                      <th>Timestamp</th>
                      <th>Worker</th>
                      <th>Task Type</th>
                      <th>Status</th>
                      <th>Duration</th>
                      <th>Items</th>
                      <th>Message</th>
                    </tr>
                  </thead>
                  <tbody>
                    {logs.map((log: any) => (
                      <tr key={log.id}>
                        <td className="whitespace-nowrap">
                          {log.status === "running"
                            ? new Date(log.created_at).toLocaleString()
                            : (log.updated_at
                                ? new Date(log.updated_at).toLocaleString()
                                : new Date(log.created_at).toLocaleString())}
                        </td>
                        <td className="whitespace-nowrap font-medium">
                          {log.worker_name}
                        </td>
                        <td className="whitespace-nowrap">
                          {log.task_type}
                        </td>
                        <td className="whitespace-nowrap">
                          <span className={`badge ${getStatusBadgeColor(log.status)}`}>
                            {log.status}
                          </span>
                        </td>
                        <td className="whitespace-nowrap">
                          {formatDuration(log.execution_time_ms)}
                        </td>
                        <td className="whitespace-nowrap">
                          {log.items_processed !== null && log.items_processed !== undefined && (
                            <div className="space-y-1 text-sm">
                              {log.items_processed > 0 && (
                                <div>Processed: {log.items_processed}</div>
                              )}
                              {log.items_created !== null && log.items_created !== undefined && log.items_created > 0 && (
                                <div>Created: {log.items_created}</div>
                              )}
                              {log.items_updated !== null && log.items_updated !== undefined && log.items_updated > 0 && (
                                <div>Updated: {log.items_updated}</div>
                              )}
                            </div>
                          )}
                        </td>
                        <td>
                          <div>
                            {log.message && (
                              <div className="mb-1">{log.message}</div>
                            )}
                            {log.error && (
                              <div className="text-error font-mono text-xs">
                                {log.error}
                              </div>
                            )}
                            {log.details && Object.keys(log.details).length > 0 && (
                              <details className="collapse collapse-arrow bg-base-200 mt-1">
                                <summary className="collapse-title text-xs min-h-0 py-2 cursor-pointer">
                                  View details
                                </summary>
                                <div className="collapse-content">
                                  <pre className="text-xs bg-base-300 p-2 rounded overflow-auto">
                                    {JSON.stringify(log.details, null, 2)}
                                  </pre>
                                </div>
                              </details>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="card-body border-t border-base-300">
                  <div className="flex items-center justify-between">
                    <div className="text-sm">
                      Showing {page * limit + 1} to {Math.min((page + 1) * limit, total)} of {total} logs
                    </div>
                    <div className="join">
                      <button
                        onClick={() => setPage((p) => Math.max(0, p - 1))}
                        disabled={page === 0}
                        className="join-item btn btn-sm"
                      >
                        Previous
                      </button>
                      <button
                        onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                        disabled={page >= totalPages - 1}
                        className="join-item btn btn-sm"
                      >
                        Next
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </AppLayout>
  );
}

