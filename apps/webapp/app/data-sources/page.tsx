"use client";

import { trpc } from "../../utils/trpc";
import { useRouter } from "next/navigation";
import { useState, useEffect, useRef } from "react";
import { AppLayout } from "../components/AppLayout";

export default function DataSourcesPage() {
  const router = useRouter();
  const trpcUtils = trpc.useUtils();
  const [page, setPage] = useState(0);
  const [isCreating, setIsCreating] = useState(false);
  const [selectedDataSourceId, setSelectedDataSourceId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [schedule, setSchedule] = useState("every 6 hours");
  const [enabled, setEnabled] = useState(true);
  const [definitionFile, setDefinitionFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [logsPage, setLogsPage] = useState(0);
  const [editingSecretKey, setEditingSecretKey] = useState<string | null>(null);
  const [newSecretKey, setNewSecretKey] = useState("");
  const [newSecretValue, setNewSecretValue] = useState("");
  const [editingSecretValue, setEditingSecretValue] = useState("");
  const [visibleSecrets, setVisibleSecrets] = useState<Set<string>>(new Set());
  // Secrets for creation form
  const [createSecrets, setCreateSecrets] = useState<Record<string, string>>({});
  const [createSecretKey, setCreateSecretKey] = useState("");
  const [createSecretValue, setCreateSecretValue] = useState("");
  const limit = 20;
  const logsLimit = 10;

  const { data: userData, isLoading: userLoading } = trpc.auth.me.useQuery();
  const { data: dataSourcesData, isLoading: dataSourcesLoading, refetch: refetchDataSources } = trpc.dataSources.list.useQuery({
    limit,
    offset: page * limit,
  });

  // Check running status for all data sources (including selected one)
  const dataSourceIds = [
    ...(dataSourcesData?.dataSources.map(ds => ds.id) || []),
    ...(selectedDataSourceId && !dataSourcesData?.dataSources.some(ds => ds.id === selectedDataSourceId) ? [selectedDataSourceId] : []),
  ];
  const { data: runningStatusData, refetch: refetchRunningStatus } = trpc.dataSources.checkRunningStatus.useQuery(
    { ids: dataSourceIds },
    { 
      enabled: dataSourceIds.length > 0,
      // Auto-refresh every 3 seconds if any data source is running
      refetchInterval: (query) => {
        const runningStatus = query.state.data?.runningStatus || {};
        const hasRunning = Object.values(runningStatus).some(status => status === true);
        return hasRunning ? 3000 : false;
      },
    },
  );

  const { data: dataSourceData, refetch: refetchDataSource } = trpc.dataSources.getById.useQuery(
    { id: selectedDataSourceId! },
    { enabled: !!selectedDataSourceId },
  );

  const { data: logsData, isLoading: logsLoading, refetch: refetchLogs } = trpc.dataSources.getLogs.useQuery(
    { 
      id: selectedDataSourceId!,
      limit: logsLimit,
      offset: logsPage * logsLimit,
    },
    { 
      enabled: !!selectedDataSourceId,
      // Auto-refresh every 3 seconds if there's a running log
      refetchInterval: (query) => {
        const logs = query.state.data?.logs || [];
        const hasRunning = logs.some((log: any) => log.status === "running");
        return hasRunning ? 3000 : false;
      },
    },
  );

  const createDataSourceMutation = trpc.dataSources.create.useMutation({
    onSuccess: () => {
      setName("");
      setDescription("");
      setSchedule("every 6 hours");
      setEnabled(true);
      setDefinitionFile(null);
      setCreateSecrets({});
      setCreateSecretKey("");
      setCreateSecretValue("");
      setIsCreating(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
      refetchDataSources();
      setToastMessage("Data source created successfully");
      setTimeout(() => setToastMessage(null), 3000);
    },
    onError: (error) => {
      setToastMessage(`Failed to create data source: ${error.message}`);
      setTimeout(() => setToastMessage(null), 3000);
    },
  });

  const updateDataSourceMutation = trpc.dataSources.update.useMutation({
    onSuccess: () => {
      refetchDataSource();
      refetchDataSources();
      setToastMessage("Data source updated successfully");
      setTimeout(() => setToastMessage(null), 3000);
    },
    onError: (error) => {
      setToastMessage(`Failed to update data source: ${error.message}`);
      setTimeout(() => setToastMessage(null), 3000);
    },
  });

  const deleteDataSourceMutation = trpc.dataSources.delete.useMutation({
    onSuccess: () => {
      setSelectedDataSourceId(null);
      // Reset to first page if we're on a page that might now be empty
      if (page > 0) {
        setPage(0);
      }
      // Invalidate and refetch data sources list to ensure cache is cleared
      trpcUtils.dataSources.list.invalidate();
      refetchDataSources();
      refetchRunningStatus();
      setToastMessage("Data source deleted successfully");
      setTimeout(() => setToastMessage(null), 3000);
    },
    onError: (error) => {
      setToastMessage(`Failed to delete data source: ${error.message}`);
      setTimeout(() => setToastMessage(null), 3000);
    },
  });

  const triggerDataSourceMutation = trpc.dataSources.trigger.useMutation({
    onSuccess: () => {
      setToastMessage("Data source triggered successfully");
      setTimeout(() => setToastMessage(null), 3000);
      refetchDataSource();
      refetchRunningStatus();
      // Refetch logs after a short delay to allow the log to be created
      setTimeout(() => {
        refetchLogs();
      }, 2000);
    },
    onError: (error) => {
      setToastMessage(`Failed to trigger data source: ${error.message}`);
      setTimeout(() => setToastMessage(null), 3000);
    },
  });


  const addSecretMutation = trpc.dataSources.addSecret.useMutation({
    onSuccess: () => {
      setNewSecretKey("");
      setNewSecretValue("");
      refetchDataSource();
      setToastMessage("Secret added successfully");
      setTimeout(() => setToastMessage(null), 3000);
    },
    onError: (error) => {
      setToastMessage(`Failed to add secret: ${error.message}`);
      setTimeout(() => setToastMessage(null), 3000);
    },
  });

  const updateSecretMutation = trpc.dataSources.updateSecret.useMutation({
    onSuccess: () => {
      setEditingSecretKey(null);
      setEditingSecretValue("");
      refetchDataSource();
      setToastMessage("Secret updated successfully");
      setTimeout(() => setToastMessage(null), 3000);
    },
    onError: (error) => {
      setToastMessage(`Failed to update secret: ${error.message}`);
      setTimeout(() => setToastMessage(null), 3000);
    },
  });

  const deleteSecretMutation = trpc.dataSources.deleteSecret.useMutation({
    onSuccess: () => {
      refetchDataSource();
      setToastMessage("Secret deleted successfully");
      setTimeout(() => setToastMessage(null), 3000);
    },
    onError: (error) => {
      setToastMessage(`Failed to delete secret: ${error.message}`);
      setTimeout(() => setToastMessage(null), 3000);
    },
  });

  useEffect(() => {
    if (!userLoading && !userData?.user) {
      router.push("/");
    }
  }, [userLoading, userData, router]);

  useEffect(() => {
    if (selectedDataSourceId && dataSourceData) {
      setName(dataSourceData.name);
      setDescription(dataSourceData.description || "");
      setSchedule(dataSourceData.schedule);
      setEnabled(dataSourceData.enabled);
      setLogsPage(0); // Reset logs page when selecting a different data source
      setEditingSecretKey(null);
      setNewSecretKey("");
      setNewSecretValue("");
      setEditingSecretValue("");
      setVisibleSecrets(new Set());
    }
  }, [selectedDataSourceId, dataSourceData]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      // Validate file type
      const ext = file.name.toLowerCase().split('.').pop();
      if (ext !== "md" && ext !== "txt" && ext !== "zip") {
        setToastMessage("Only .md, .txt, and .zip files are supported");
        setTimeout(() => setToastMessage(null), 3000);
        return;
      }
      setDefinitionFile(file);
    }
  };

  const convertFileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => {
        const result = reader.result as string;
        // Remove data URL prefix (e.g., "data:text/plain;base64,")
        const base64 = result.split(",")[1];
        resolve(base64);
      };
      reader.onerror = (error) => reject(error);
    });
  };

  const handleCreateDataSource = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!definitionFile) {
      setToastMessage("Please select a definition file");
      setTimeout(() => setToastMessage(null), 3000);
      return;
    }

    try {
      const base64Data = await convertFileToBase64(definitionFile);
      createDataSourceMutation.mutate({
        name: name.trim(),
        description: description.trim() || undefined,
        schedule: schedule.trim(),
        enabled,
        definition_file: {
          filename: definitionFile.name,
          mimeType: definitionFile.type || "application/octet-stream",
          data: base64Data,
        },
        secrets: Object.keys(createSecrets).length > 0 ? createSecrets : undefined,
      });
    } catch (error: any) {
      setToastMessage(`Failed to process file: ${error.message}`);
      setTimeout(() => setToastMessage(null), 3000);
    }
  };

  const handleAddCreateSecret = (e: React.FormEvent) => {
    e.preventDefault();
    if (!createSecretKey.trim() || !createSecretValue.trim()) {
      setToastMessage("Please provide both key and value");
      setTimeout(() => setToastMessage(null), 3000);
      return;
    }
    setCreateSecrets({
      ...createSecrets,
      [createSecretKey.trim()]: createSecretValue,
    });
    setCreateSecretKey("");
    setCreateSecretValue("");
  };

  const handleRemoveCreateSecret = (key: string) => {
    const newSecrets = { ...createSecrets };
    delete newSecrets[key];
    setCreateSecrets(newSecrets);
  };

  const handleUpdateDataSource = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedDataSourceId) return;
    updateDataSourceMutation.mutate({
      id: selectedDataSourceId,
      name: name.trim() || undefined,
      description: description.trim() || undefined,
      schedule: schedule.trim() || undefined,
      enabled,
    });
  };

  const handleDeleteDataSource = () => {
    if (!selectedDataSourceId) return;
    if (!confirm("Are you sure you want to delete this data source? This action cannot be undone.")) {
      return;
    }
    deleteDataSourceMutation.mutate({ id: selectedDataSourceId });
  };

  const handleTriggerDataSource = () => {
    if (!selectedDataSourceId) return;
    triggerDataSourceMutation.mutate({ id: selectedDataSourceId });
  };

  const handleAddSecret = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedDataSourceId || !newSecretKey.trim() || !newSecretValue.trim()) {
      setToastMessage("Please provide both key and value");
      setTimeout(() => setToastMessage(null), 3000);
      return;
    }
    addSecretMutation.mutate({
      id: selectedDataSourceId,
      key: newSecretKey.trim(),
      value: newSecretValue,
    });
  };

  const handleUpdateSecret = (key: string) => {
    if (!selectedDataSourceId || !editingSecretValue.trim()) {
      setToastMessage("Please provide a value");
      setTimeout(() => setToastMessage(null), 3000);
      return;
    }
    updateSecretMutation.mutate({
      id: selectedDataSourceId,
      key,
      value: editingSecretValue,
    });
  };

  const handleDeleteSecret = (key: string) => {
    if (!selectedDataSourceId) return;
    if (!confirm(`Are you sure you want to delete the secret "${key}"?`)) {
      return;
    }
    deleteSecretMutation.mutate({
      id: selectedDataSourceId,
      key,
    });
  };

  const toggleSecretVisibility = (key: string) => {
    const newVisible = new Set(visibleSecrets);
    if (newVisible.has(key)) {
      newVisible.delete(key);
    } else {
      newVisible.add(key);
    }
    setVisibleSecrets(newVisible);
  };

  if (userLoading) {
    return (
      <AppLayout>
        <div className="text-xl text-slate-600">Loading...</div>
      </AppLayout>
    );
  }

  if (!userData?.user) {
    return null;
  }

  const dataSources = dataSourcesData?.dataSources || [];
  const total = dataSourcesData?.total || 0;
  const totalPages = Math.ceil(total / limit);

  return (
    <AppLayout>
      {/* Toast Notification */}
      {toastMessage && (
        <div className="toast toast-top toast-end z-50">
          <div className="alert alert-success">
            <svg
              className="w-5 h-5 flex-shrink-0"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <span>{toastMessage}</span>
            <button
              onClick={() => setToastMessage(null)}
              className="btn btn-ghost btn-xs"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
      )}
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-6">
          <h1 className="text-3xl font-bold">Data Sources</h1>
          <p className="text-base-content/70 mt-2">Manage automated data sources that gather knowledge</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Data Sources List */}
          <div className="lg:col-span-1">
            <div className="card bg-base-100 shadow-xl border border-base-300">
              <div className="card-body">
                <div className="flex justify-between items-center mb-4">
                  <h2 className="text-lg font-semibold">Data Sources</h2>
                  <button
                    onClick={() => {
                      setIsCreating(true);
                      setSelectedDataSourceId(null);
                      setName("");
                      setDescription("");
                      setSchedule("every 6 hours");
                      setEnabled(true);
                      setDefinitionFile(null);
                      setCreateSecrets({});
                      setCreateSecretKey("");
                      setCreateSecretValue("");
                      if (fileInputRef.current) {
                        fileInputRef.current.value = "";
                      }
                    }}
                    className="btn btn-primary btn-sm gap-1"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                    </svg>
                    New
                  </button>
                </div>

              {isCreating ? (
                <div className="bg-base-200 rounded-lg p-4 mb-4 border border-base-300">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="loading loading-spinner loading-sm text-primary"></div>
                      <p className="text-sm font-medium">Creating new data source...</p>
                    </div>
                    <button
                      onClick={() => {
                        setIsCreating(false);
                        setName("");
                        setDescription("");
                        setSchedule("every 6 hours");
                        setEnabled(true);
                        setDefinitionFile(null);
                        setCreateSecrets({});
                        setCreateSecretKey("");
                        setCreateSecretValue("");
                        if (fileInputRef.current) {
                          fileInputRef.current.value = "";
                        }
                      }}
                      className="btn btn-ghost btn-xs"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : null}

              <div className="space-y-2">
                {dataSourcesLoading ? (
                  <div className="flex items-center gap-2 text-sm text-base-content/70 py-4">
                    <span className="loading loading-spinner loading-sm"></span>
                    Loading...
                  </div>
                ) : dataSources.length === 0 ? (
                  <div className="text-center py-8">
                    <svg className="w-12 h-12 text-base-content/20 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4" />
                    </svg>
                    <p className="text-sm font-medium text-base-content/70">No data sources yet</p>
                    <p className="text-xs text-base-content/50 mt-1">Click "+ New" to create your first data source</p>
                  </div>
                ) : (
                  dataSources.map((ds) => {
                    const isRunning = runningStatusData?.runningStatus[ds.id] || false;
                    const runningLog = runningStatusData?.runningLogs[ds.id];
                    return (
                      <button
                        key={ds.id}
                        onClick={() => {
                          setSelectedDataSourceId(ds.id);
                          setIsCreating(false);
                        }}
                        className={`w-full text-left px-4 py-3 rounded-lg transition-all border ${
                          selectedDataSourceId === ds.id
                            ? "bg-primary/10 border-primary/30 shadow-sm"
                            : "border-transparent hover:bg-base-200 hover:border-base-300"
                        }`}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2 flex-1 min-w-0">
                            <div className={`font-medium truncate ${selectedDataSourceId === ds.id ? "text-primary" : ""}`}>
                              {ds.name}
                            </div>
                            {isRunning && (
                              <div className="badge badge-info badge-sm gap-1">
                                <svg className="w-3 h-3 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                </svg>
                                <span className="text-xs">Running</span>
                              </div>
                            )}
                          </div>
                          <div className={`badge badge-sm ${ds.enabled ? "badge-success" : "badge-ghost"}`}>
                            {ds.enabled ? "Active" : "Inactive"}
                          </div>
                        </div>
                        {ds.description && (
                          <div className="text-xs text-base-content/60 mb-2 line-clamp-2">{ds.description}</div>
                        )}
                        <div className="flex items-center gap-2 text-xs text-base-content/50">
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                          <span>{ds.schedule}</span>
                        </div>
                        {isRunning && runningLog?.message && (
                          <div className="text-xs text-info mt-2 truncate" title={runningLog.message}>
                            → {runningLog.message}
                          </div>
                        )}
                      </button>
                    );
                  })
                )}
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="mt-4 flex items-center justify-between">
                  <button
                    onClick={() => setPage(Math.max(0, page - 1))}
                    disabled={page === 0}
                    className="btn btn-sm btn-outline"
                  >
                    Previous
                  </button>
                  <span className="text-sm">
                    Page {page + 1} of {totalPages}
                  </span>
                  <button
                    onClick={() => setPage(Math.min(totalPages - 1, page + 1))}
                    disabled={page >= totalPages - 1}
                    className="btn btn-sm btn-outline"
                  >
                    Next
                  </button>
                </div>
              )}
              </div>
            </div>
          </div>

          {/* Data Source Details */}
          <div className="lg:col-span-2">
            {isCreating ? (
              <div className="card bg-base-100 shadow-xl border border-base-300">
                <div className="card-body">
                  <h2 className="text-2xl font-bold mb-2">Create Data Source</h2>
                  <p className="text-sm text-base-content/60 mb-6">Configure your automated data source with schedule and secrets</p>

                  <form onSubmit={handleCreateDataSource} className="space-y-6">
                  <div className="form-control">
                    <label className="label">
                      <span className="label-text font-medium">Name <span className="text-error">*</span></span>
                    </label>
                    <input
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="input input-bordered w-full"
                      placeholder="My Data Source"
                      required
                    />
                  </div>

                  <div className="form-control">
                    <label className="label">
                      <span className="label-text font-medium">Description</span>
                    </label>
                    <textarea
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      className="textarea textarea-bordered"
                      rows={3}
                      placeholder="Describe what this data source does..."
                    />
                  </div>

                  <div className="form-control">
                    <label className="label">
                      <span className="label-text font-medium">Schedule <span className="text-error">*</span></span>
                    </label>
                    <input
                      type="text"
                      value={schedule}
                      onChange={(e) => setSchedule(e.target.value)}
                      className="input input-bordered w-full"
                      placeholder="every 6 hours"
                      required
                    />
                    <label className="label">
                      <span className="label-text-alt text-base-content/60">Examples: "every 6 hours", "every 1 day", "0 */6 * * *" (cron)</span>
                    </label>
                  </div>

                  <div className="form-control">
                    <label className="label">
                      <span className="label-text font-medium">Definition File <span className="text-error">*</span> <span className="text-xs text-base-content/60">(.md, .txt, or .zip)</span></span>
                    </label>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".md,.txt,.zip"
                      onChange={handleFileChange}
                      className="file-input file-input-bordered w-full"
                      required
                    />
                    {definitionFile && (
                      <label className="label">
                        <span className="label-text-alt text-success">✓ Selected: {definitionFile.name}</span>
                      </label>
                    )}
                    <label className="label">
                      <span className="label-text-alt text-base-content/60">Upload a markdown file with instructions, or a zip file containing .md files and code files</span>
                    </label>
                  </div>

                  <div className="form-control">
                    <label className="label cursor-pointer justify-start gap-3 p-4 bg-base-200 rounded-lg">
                      <input
                        type="checkbox"
                        id="enabled"
                        checked={enabled}
                        onChange={(e) => setEnabled(e.target.checked)}
                        className="checkbox checkbox-primary"
                      />
                      <div>
                        <span className="label-text font-medium">Enabled (run automatically)</span>
                        <p className="text-xs text-base-content/60 mt-1">Data source will run on the specified schedule</p>
                      </div>
                    </label>
                  </div>

                  {/* Secrets Section */}
                  <div className="divider my-6"></div>
                  <div>
                    <div className="flex items-center gap-2 mb-4">
                      <svg className="w-5 h-5 text-base-content/70" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                      </svg>
                      <h3 className="text-lg font-semibold">Secrets</h3>
                    </div>

                    {/* Existing Secrets */}
                    {Object.keys(createSecrets).length > 0 && (
                      <div className="space-y-2 mb-6">
                        {Object.entries(createSecrets).map(([key, value]) => (
                          <div
                            key={key}
                            className="bg-base-200 rounded-lg p-3 border border-base-300"
                          >
                            <div className="flex items-center justify-between">
                              <div className="flex-1">
                                <div className="text-sm font-medium">{key}</div>
                                <div className="text-xs text-base-content/50 font-mono mt-1">••••••••</div>
                              </div>
                              <button
                                type="button"
                                onClick={() => handleRemoveCreateSecret(key)}
                                className="btn btn-ghost btn-xs btn-square text-error hover:bg-error/10"
                                title="Remove"
                              >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                </svg>
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Add New Secret Form */}
                    <div className="bg-base-200 rounded-lg p-4 border border-base-300">
                      <p className="text-xs text-base-content/60 mb-3">Add secrets that will be available to your data source script (e.g., API keys, tokens)</p>
                      <div className="grid grid-cols-2 gap-3 mb-3">
                        <div className="form-control">
                          <label className="label py-1">
                            <span className="label-text text-xs font-medium">Key</span>
                          </label>
                          <input
                            type="text"
                            value={createSecretKey}
                            onChange={(e) => setCreateSecretKey(e.target.value)}
                            className="input input-bordered input-sm"
                            placeholder="e.g., API_KEY"
                          />
                        </div>
                        <div className="form-control">
                          <label className="label py-1">
                            <span className="label-text text-xs font-medium">Value</span>
                          </label>
                          <input
                            type="password"
                            value={createSecretValue}
                            onChange={(e) => setCreateSecretValue(e.target.value)}
                            className="input input-bordered input-sm"
                            placeholder="Enter secret value"
                          />
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={handleAddCreateSecret}
                        className="btn btn-sm btn-outline w-full"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                        </svg>
                        Add Secret
                      </button>
                    </div>
                  </div>

                  <div className="divider my-6"></div>

                  <div className="flex gap-3">
                    <button
                      type="submit"
                      disabled={createDataSourceMutation.isPending}
                      className="btn btn-primary flex-1"
                    >
                      {createDataSourceMutation.isPending ? (
                        <>
                          <span className="loading loading-spinner loading-sm"></span>
                          Creating...
                        </>
                      ) : (
                        <>
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                          Create Data Source
                        </>
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setIsCreating(false);
                        setName("");
                        setDescription("");
                        setSchedule("every 6 hours");
                        setEnabled(true);
                        setDefinitionFile(null);
                        setCreateSecrets({});
                        setCreateSecretKey("");
                        setCreateSecretValue("");
                        if (fileInputRef.current) {
                          fileInputRef.current.value = "";
                        }
                      }}
                      className="btn btn-ghost"
                    >
                      Cancel
                    </button>
                  </div>
                </form>
                </div>
              </div>
            ) : selectedDataSourceId && dataSourceData ? (
              <div className="card bg-base-100 shadow-xl">
                <div className="card-body">
                  <div className="flex justify-between items-start mb-6">
                    <div className="flex-1">
                      <div className="flex items-center gap-3">
                        <h2 className="card-title text-2xl">{dataSourceData.name}</h2>
                        {runningStatusData?.runningStatus[selectedDataSourceId!] && (
                          <div className="badge badge-info gap-2">
                            <svg className="w-4 h-4 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                            </svg>
                            <span>Running</span>
                          </div>
                        )}
                      </div>
                      {dataSourceData.description && (
                        <p className="text-base-content/70 mt-1">{dataSourceData.description}</p>
                      )}
                      {runningStatusData?.runningStatus[selectedDataSourceId!] && runningStatusData?.runningLogs[selectedDataSourceId!]?.message && (
                        <p className="text-sm text-info mt-2">
                          {runningStatusData.runningLogs[selectedDataSourceId!]?.message}
                        </p>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={handleTriggerDataSource}
                        disabled={triggerDataSourceMutation.isPending}
                        className="btn btn-primary btn-sm"
                      >
                        {triggerDataSourceMutation.isPending ? "Triggering..." : "Run Now"}
                      </button>
                      <button
                        onClick={handleDeleteDataSource}
                        disabled={deleteDataSourceMutation.isPending}
                        className="btn btn-error btn-sm"
                      >
                        Delete
                      </button>
                    </div>
                  </div>

                <div className="space-y-4 mb-6">
                  <div className="flex items-center gap-4">
                    <div>
                      <span className="text-sm text-base-content/70">Status:</span>
                      <span className={`ml-2 badge ${
                        dataSourceData.enabled ? "badge-success" : "badge-ghost"
                      }`}>
                        {dataSourceData.enabled ? "Enabled" : "Disabled"}
                      </span>
                    </div>
                    <div>
                      <span className="text-sm text-base-content/70">Schedule:</span>
                      <span className="ml-2 text-sm font-medium">{dataSourceData.schedule}</span>
                    </div>
                  </div>
                  {dataSourceData.last_run_at && (
                    <div>
                      <span className="text-sm text-base-content/70">Last Run:</span>
                      <span className="ml-2 text-sm">{new Date(dataSourceData.last_run_at).toLocaleString()}</span>
                    </div>
                  )}
                  {dataSourceData.next_run_at && (
                    <div>
                      <span className="text-sm text-base-content/70">Next Run:</span>
                      <span className="ml-2 text-sm">{new Date(dataSourceData.next_run_at).toLocaleString()}</span>
                    </div>
                  )}
                </div>

                <form onSubmit={handleUpdateDataSource} className="space-y-4">
                  <div className="form-control">
                    <label className="label">
                      <span className="label-text">Name</span>
                    </label>
                    <input
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="input input-bordered w-full"
                      required
                    />
                  </div>
                  <div className="form-control">
                    <label className="label">
                      <span className="label-text">Description</span>
                    </label>
                    <textarea
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      className="textarea textarea-bordered"
                      rows={3}
                    />
                  </div>
                  <div className="form-control">
                    <label className="label">
                      <span className="label-text">Schedule</span>
                    </label>
                    <input
                      type="text"
                      value={schedule}
                      onChange={(e) => setSchedule(e.target.value)}
                      className="input input-bordered w-full"
                      required
                    />
                    <label className="label">
                      <span className="label-text-alt">Examples: "every 6 hours", "every 1 day", "0 */6 * * *" (cron)</span>
                    </label>
                  </div>
                  <div className="form-control">
                    <label className="label cursor-pointer justify-start gap-2">
                      <input
                        type="checkbox"
                        id="update-enabled"
                        checked={enabled}
                        onChange={(e) => setEnabled(e.target.checked)}
                        className="checkbox checkbox-primary"
                      />
                      <span className="label-text">Enabled (run automatically)</span>
                    </label>
                  </div>
                  {dataSourceData.definition_file && (
                    <div className="form-control">
                      <label className="label">
                        <span className="label-text">Definition File</span>
                      </label>
                      <div className="card bg-base-200">
                        <div className="card-body p-4">
                          <p className="text-sm">{dataSourceData.definition_file.original_filename}</p>
                          <p className="text-xs text-base-content/70 mt-1">
                            {(dataSourceData.definition_file.size / 1024).toFixed(2)} KB
                          </p>
                        </div>
                      </div>
                    </div>
                  )}
                  <button
                    type="submit"
                    disabled={updateDataSourceMutation.isPending}
                    className="btn btn-primary"
                  >
                    {updateDataSourceMutation.isPending ? "Saving..." : "Save Changes"}
                  </button>
                </form>

                {/* Secrets Management Section */}
                <div className="divider"></div>
                <div className="mt-6">
                  <div className="flex justify-between items-center mb-4">
                    <h3 className="text-lg font-semibold">Secrets</h3>
                  </div>

                  {/* Existing Secrets */}
                  {dataSourceData.secrets && Object.keys(dataSourceData.secrets).length > 0 ? (
                    <div className="space-y-3 mb-6">
                      {Object.entries(dataSourceData.secrets).map(([key, value]) => (
                        <div
                          key={key}
                          className="card bg-base-200"
                        >
                          <div className="card-body p-4">
                          {editingSecretKey === key ? (
                            <div className="space-y-3">
                              <div className="form-control">
                                <label className="label">
                                  <span className="label-text">Key</span>
                                </label>
                                <div className="input input-bordered bg-base-300">
                                  {key}
                                </div>
                              </div>
                              <div className="form-control">
                                <label className="label">
                                  <span className="label-text">Value</span>
                                </label>
                                <input
                                  type="password"
                                  value={editingSecretValue}
                                  onChange={(e) => setEditingSecretValue(e.target.value)}
                                  className="input input-bordered input-sm"
                                  placeholder="Enter secret value"
                                />
                              </div>
                              <div className="flex gap-2">
                                <button
                                  onClick={() => handleUpdateSecret(key)}
                                  disabled={updateSecretMutation.isPending}
                                  className="btn btn-primary btn-sm"
                                >
                                  {updateSecretMutation.isPending ? "Saving..." : "Save"}
                                </button>
                                <button
                                  onClick={() => {
                                    setEditingSecretKey(null);
                                    setEditingSecretValue("");
                                  }}
                                  className="btn btn-ghost btn-sm"
                                >
                                  Cancel
                                </button>
                              </div>
                            </div>
                          ) : (
                            <div className="flex items-center justify-between">
                              <div className="flex-1">
                                <div className="text-sm font-medium mb-1">{key}</div>
                                <div className="text-sm font-mono">
                                  {visibleSecrets.has(key) ? (
                                    <span>{value}</span>
                                  ) : (
                                    <span className="text-base-content/50">••••••••</span>
                                  )}
                                </div>
                              </div>
                              <div className="flex gap-2">
                                <button
                                  onClick={() => toggleSecretVisibility(key)}
                                  className="btn btn-ghost btn-sm btn-square"
                                  title={visibleSecrets.has(key) ? "Hide" : "Show"}
                                >
                                  {visibleSecrets.has(key) ? (
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.29 3.29m0 0L9.88 9.88m-3.29-3.29L3 3m6.59 6.59L12.12 12.12" />
                                    </svg>
                                  ) : (
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                                    </svg>
                                  )}
                                </button>
                                <button
                                  onClick={() => {
                                    setEditingSecretKey(key);
                                    setEditingSecretValue(value);
                                  }}
                                  className="btn btn-ghost btn-sm btn-square text-primary"
                                  title="Edit"
                                >
                                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                  </svg>
                                </button>
                                <button
                                  onClick={() => handleDeleteSecret(key)}
                                  disabled={deleteSecretMutation.isPending}
                                  className="btn btn-ghost btn-sm btn-square text-error"
                                  title="Delete"
                                >
                                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                  </svg>
                                </button>
                              </div>
                            </div>
                          )}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-sm text-base-content/70 mb-6">No secrets configured</div>
                  )}

                  {/* Add New Secret Form */}
                  <div className="divider"></div>
                  <div>
                    <h4 className="text-sm font-semibold mb-3">Add New Secret</h4>
                    <form onSubmit={handleAddSecret} className="space-y-3">
                      <div className="form-control">
                        <label className="label">
                          <span className="label-text">Key</span>
                        </label>
                        <input
                          type="text"
                          value={newSecretKey}
                          onChange={(e) => setNewSecretKey(e.target.value)}
                          className="input input-bordered input-sm"
                          placeholder="e.g., API_KEY"
                          required
                        />
                      </div>
                      <div className="form-control">
                        <label className="label">
                          <span className="label-text">Value</span>
                        </label>
                        <input
                          type="password"
                          value={newSecretValue}
                          onChange={(e) => setNewSecretValue(e.target.value)}
                          className="input input-bordered input-sm"
                          placeholder="Enter secret value"
                          required
                        />
                      </div>
                      <button
                        type="submit"
                        disabled={addSecretMutation.isPending}
                        className="btn btn-primary btn-sm"
                      >
                        {addSecretMutation.isPending ? "Adding..." : "Add Secret"}
                      </button>
                    </form>
                  </div>
                </div>

                {/* Execution Logs Section */}
                <div className="divider"></div>
                <div className="mt-6">
                  <div className="flex justify-between items-center mb-4">
                    <h3 className="text-lg font-semibold">Execution Logs</h3>
                    <button
                      onClick={() => refetchLogs()}
                      className="btn btn-ghost btn-sm"
                    >
                      Refresh
                    </button>
                  </div>

                  {logsLoading ? (
                    <div className="text-sm text-base-content/70 py-4">Loading logs...</div>
                  ) : !logsData || logsData.logs.length === 0 ? (
                    <div className="text-sm text-base-content/70 py-4">No execution logs yet</div>
                  ) : (
                    <>
                      <div className="space-y-3">
                        {logsData.logs.map((log) => (
                          <div
                            key={log.id}
                            className={`card ${
                              log.status === "success"
                                ? "bg-success/10"
                                : log.status === "error"
                                ? "bg-error/10"
                                : log.status === "running"
                                ? "bg-info/10"
                                : "bg-base-200"
                            }`}
                          >
                            <div className="card-body p-4">
                              <div className="flex items-start justify-between">
                                <div className="flex-1">
                                  <div className="flex items-center gap-2 mb-1">
                                    <span
                                      className={`badge badge-sm ${
                                        log.status === "success"
                                          ? "badge-success"
                                          : log.status === "error"
                                          ? "badge-error"
                                          : log.status === "running"
                                          ? "badge-info"
                                          : "badge-ghost"
                                      }`}
                                    >
                                      {log.status.toUpperCase()}
                                    </span>
                                    <span className="text-xs text-base-content/70">
                                      {log.status === "running"
                                        ? new Date(log.created_at).toLocaleString()
                                        : (log.updated_at
                                            ? new Date(log.updated_at).toLocaleString()
                                            : new Date(log.created_at).toLocaleString())}
                                    </span>
                                  </div>
                                  {log.message && (
                                    <p className="text-sm mb-1">{log.message}</p>
                                  )}
                                  {log.error && (
                                    <p className="text-sm text-error mt-1 font-mono text-xs">
                                      {log.error}
                                    </p>
                                  )}
                                {log.details?.progress && Array.isArray(log.details.progress) && log.details.progress.length > 0 && (
                                  <>
                                    <div className="mt-3 pt-3 divider"></div>
                                    <div>
                                      <p className="text-xs font-medium mb-2">Progress:</p>
                                      <div className="space-y-2 max-h-48 overflow-y-auto">
                                        {log.details.progress.map((entry: any, idx: number) => (
                                          <div key={idx} className="text-xs pl-3 border-l-2 border-base-300">
                                            <div className="flex items-start gap-2">
                                              <span className="text-base-content/50 font-mono text-[10px] mt-1">
                                                {entry.timestamp ? new Date(entry.timestamp).toLocaleTimeString() : ''}
                                              </span>
                                              <span className="flex-1">{entry.message}</span>
                                            </div>
                                            {entry.metadata && Object.keys(entry.metadata).length > 0 && (
                                              <div className="mt-1 ml-5 text-[10px] text-base-content/70 font-mono">
                                                {JSON.stringify(entry.metadata, null, 2)}
                                              </div>
                                            )}
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                  </>
                                )}
                                <div className="flex gap-4 mt-2 text-xs text-base-content/70">
                                  {log.execution_time_ms !== null && log.execution_time_ms !== undefined && (
                                    <span>Duration: {(log.execution_time_ms / 1000).toFixed(2)}s</span>
                                  )}
                                  {log.items_created !== null && log.items_created !== undefined && (
                                    <span>Facts created: {log.items_created}</span>
                                  )}
                                </div>
                              </div>
                            </div>
                            </div>
                          </div>
                        ))}
                      </div>

                      {/* Logs Pagination */}
                      {logsData.total > logsLimit && (
                        <div className="mt-4 flex items-center justify-between">
                          <button
                            onClick={() => setLogsPage(Math.max(0, logsPage - 1))}
                            disabled={logsPage === 0}
                            className="btn btn-sm btn-outline"
                          >
                            Previous
                          </button>
                          <span className="text-sm">
                            Page {logsPage + 1} of {Math.ceil(logsData.total / logsLimit)}
                          </span>
                          <button
                            onClick={() => setLogsPage(Math.min(Math.ceil(logsData.total / logsLimit) - 1, logsPage + 1))}
                            disabled={logsPage >= Math.ceil(logsData.total / logsLimit) - 1}
                            className="btn btn-sm btn-outline"
                          >
                            Next
                          </button>
                        </div>
                      )}
                    </>
                  )}
                </div>
                </div>
              </div>
            ) : (
              <div className="card bg-base-100 shadow-xl">
                <div className="card-body p-12 text-center">
                  <p className="text-base-content/70">Select a data source to view details or create a new one</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </AppLayout>
  );
}

