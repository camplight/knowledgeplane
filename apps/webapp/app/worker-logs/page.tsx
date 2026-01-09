"use client";

import { trpc } from "../../utils/trpc";
import { useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import { Navigation } from "../components/Navigation";

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
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-xl text-slate-600">Loading...</div>
      </div>
    );
  }

  if (!userData?.user) {
    return null;
  }

  const logs = logsData?.logs || [];
  const total = logsData?.total || 0;
  const totalPages = Math.ceil(total / limit);

  const getStatusColor = (status: string) => {
    switch (status) {
      case "success":
        return "bg-green-100 text-green-800";
      case "error":
        return "bg-red-100 text-red-800";
      case "running":
        return "bg-blue-100 text-blue-800";
      default:
        return "bg-slate-100 text-slate-800";
    }
  };

  const formatDuration = (ms?: number) => {
    if (!ms) return "N/A";
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(2)}s`;
    return `${(ms / 60000).toFixed(2)}m`;
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <Navigation />

      <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-slate-900">Background Worker Logs</h1>
            <p className="text-slate-600 mt-2">
              View execution results and status of background worker tasks
            </p>
          </div>
          <div className="flex gap-3">
            <button
              onClick={() => triggerWorker.mutate({ worker: "card-consolidator" })}
              disabled={triggerWorker.isPending}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium transition-colors"
            >
              {triggerWorker.isPending ? "Triggering..." : "Trigger Card Consolidator"}
            </button>
            <button
              onClick={() => triggerWorker.mutate({ worker: "embeddings-generator" })}
              disabled={triggerWorker.isPending}
              className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium transition-colors"
            >
              {triggerWorker.isPending ? "Triggering..." : "Trigger Embeddings Generator"}
            </button>
          </div>
        </div>

        {/* Filters */}
        <div className="mb-6 bg-white rounded-xl shadow-lg border border-slate-200 p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Worker Name
              </label>
              <input
                type="text"
                placeholder="Filter by worker name..."
                value={workerFilter}
                onChange={(e) => {
                  setWorkerFilter(e.target.value);
                  setPage(0);
                }}
                className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Status
              </label>
              <select
                value={statusFilter}
                onChange={(e) => {
                  setStatusFilter(e.target.value as any);
                  setPage(0);
                }}
                className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="">All Statuses</option>
                <option value="success">Success</option>
                <option value="error">Error</option>
                <option value="running">Running</option>
              </select>
            </div>
          </div>
        </div>

        {/* Logs Table */}
        <div className="bg-white rounded-xl shadow-lg border border-slate-200 overflow-hidden">
          {logsLoading ? (
            <div className="p-8 text-center">
              <div className="text-slate-600">Loading logs...</div>
            </div>
          ) : logs.length === 0 ? (
            <div className="p-8 text-center">
              <p className="text-lg font-medium text-slate-900 mb-2">No logs found</p>
              <p className="text-slate-600">Worker logs will appear here after tasks are executed</p>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                        Timestamp
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                        Worker
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                        Task Type
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                        Status
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                        Duration
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                        Items
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                        Message
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {logs.map((log: any) => (
                      <tr key={log.id} className="hover:bg-slate-50">
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-900">
                          {log.status === "running" 
                            ? new Date(log.created_at).toLocaleString()
                            : (log.updated_at 
                                ? new Date(log.updated_at).toLocaleString()
                                : new Date(log.created_at).toLocaleString())}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-slate-900">
                          {log.worker_name}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-600">
                          {log.task_type}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span
                            className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(
                              log.status,
                            )}`}
                          >
                            {log.status}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-600">
                          {formatDuration(log.execution_time_ms)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-600">
                          {log.items_processed !== null && log.items_processed !== undefined && (
                            <div className="space-y-1">
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
                        <td className="px-6 py-4 text-sm text-slate-600">
                          <div>
                            {log.message && (
                              <div className="mb-1">{log.message}</div>
                            )}
                            {log.error && (
                              <div className="text-red-600 font-mono text-xs">
                                {log.error}
                              </div>
                            )}
                            {log.details && Object.keys(log.details).length > 0 && (
                              <details className="mt-1">
                                <summary className="text-xs text-slate-500 cursor-pointer hover:text-slate-700">
                                  View details
                                </summary>
                                <pre className="mt-2 text-xs bg-slate-50 p-2 rounded border border-slate-200 overflow-auto">
                                  {JSON.stringify(log.details, null, 2)}
                                </pre>
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
                <div className="px-6 py-4 border-t border-slate-200 flex items-center justify-between">
                  <div className="text-sm text-slate-600">
                    Showing {page * limit + 1} to {Math.min((page + 1) * limit, total)} of {total} logs
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setPage((p) => Math.max(0, p - 1))}
                      disabled={page === 0}
                      className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Previous
                    </button>
                    <button
                      onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                      disabled={page >= totalPages - 1}
                      className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Next
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

