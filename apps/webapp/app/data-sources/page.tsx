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
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-xl text-slate-600">Loading...</div>
      </div>
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
        <div className="fixed top-4 right-4 z-50 animate-in slide-in-from-top-5">
          <div className="bg-slate-900 text-white px-4 py-3 rounded-lg shadow-lg flex items-center gap-3 min-w-[300px]">
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
            <span className="flex-1">{toastMessage}</span>
            <button
              onClick={() => setToastMessage(null)}
              className="text-slate-400 hover:text-white"
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
          <h1 className="text-3xl font-bold text-slate-900">Data Sources</h1>
          <p className="text-slate-600 mt-2">Manage automated data sources that gather knowledge</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Data Sources List */}
          <div className="lg:col-span-1">
            <div className="bg-white border border-slate-200 rounded-lg p-4">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-lg font-semibold text-slate-900">Data Sources</h2>
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
                  className="px-3 py-1 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
                >
                  + New
                </button>
              </div>

              {isCreating ? (
                <div className="mb-4 p-3 bg-slate-50 rounded-lg">
                  <p className="text-sm text-slate-600 mb-2">Creating new data source...</p>
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
                    className="text-sm text-slate-600 hover:text-slate-900"
                  >
                    Cancel
                  </button>
                </div>
              ) : null}

              <div className="space-y-2">
                {dataSourcesLoading ? (
                  <div className="text-sm text-slate-500">Loading...</div>
                ) : dataSources.length === 0 ? (
                  <div className="text-sm text-slate-500">No data sources yet</div>
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
                        className={`w-full text-left px-3 py-2 rounded-lg transition-colors ${
                          selectedDataSourceId === ds.id
                            ? "bg-indigo-100 text-indigo-900 font-medium"
                            : "hover:bg-slate-50"
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2 flex-1 min-w-0">
                            <div className="font-medium truncate">{ds.name}</div>
                            {isRunning && (
                              <div className="flex items-center gap-1 text-blue-600 flex-shrink-0">
                                <svg className="w-3 h-3 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                </svg>
                                <span className="text-xs">Running</span>
                              </div>
                            )}
                          </div>
                          <div className={`w-2 h-2 rounded-full ${ds.enabled ? "bg-green-500" : "bg-slate-300"}`} />
                        </div>
                        {ds.description && (
                          <div className="text-xs text-slate-500 mt-1 line-clamp-1">{ds.description}</div>
                        )}
                        <div className="flex items-center justify-between mt-1">
                          <div className="text-xs text-slate-400">Schedule: {ds.schedule}</div>
                          {isRunning && runningLog?.message && (
                            <div className="text-xs text-blue-600 truncate ml-2 max-w-[200px]" title={runningLog.message}>
                              {runningLog.message}
                            </div>
                          )}
                        </div>
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
                    className="px-3 py-1 text-sm border border-slate-300 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Previous
                  </button>
                  <span className="text-sm text-slate-600">
                    Page {page + 1} of {totalPages}
                  </span>
                  <button
                    onClick={() => setPage(Math.min(totalPages - 1, page + 1))}
                    disabled={page >= totalPages - 1}
                    className="px-3 py-1 text-sm border border-slate-300 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Next
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Data Source Details */}
          <div className="lg:col-span-2">
            {isCreating ? (
              <div className="bg-white border border-slate-200 rounded-lg p-6">
                <h2 className="text-2xl font-bold text-slate-900 mb-6">Create Data Source</h2>
                <form onSubmit={handleCreateDataSource} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">
                      Name *
                    </label>
                    <input
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="w-full px-4 py-2 border border-slate-300 rounded-lg"
                      placeholder="My Data Source"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">
                      Description
                    </label>
                    <textarea
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      className="w-full px-4 py-2 border border-slate-300 rounded-lg"
                      rows={3}
                      placeholder="Describe what this data source does..."
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">
                      Schedule *
                    </label>
                    <input
                      type="text"
                      value={schedule}
                      onChange={(e) => setSchedule(e.target.value)}
                      className="w-full px-4 py-2 border border-slate-300 rounded-lg"
                      placeholder="every 6 hours"
                      required
                    />
                    <p className="mt-1 text-xs text-slate-500">
                      Examples: "every 6 hours", "every 1 day", "0 */6 * * *" (cron)
                    </p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">
                      Definition File * (.md, .txt, or .zip)
                    </label>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".md,.txt,.zip"
                      onChange={handleFileChange}
                      className="w-full px-4 py-2 border border-slate-300 rounded-lg"
                      required
                    />
                    {definitionFile && (
                      <p className="mt-1 text-sm text-slate-600">Selected: {definitionFile.name}</p>
                    )}
                    <p className="mt-1 text-xs text-slate-500">
                      Upload a markdown file with instructions, or a zip file containing .md files and code files
                    </p>
                  </div>
                  <div className="flex items-center">
                    <input
                      type="checkbox"
                      id="enabled"
                      checked={enabled}
                      onChange={(e) => setEnabled(e.target.checked)}
                      className="w-4 h-4 text-indigo-600 border-slate-300 rounded focus:ring-indigo-500"
                    />
                    <label htmlFor="enabled" className="ml-2 text-sm text-slate-700">
                      Enabled (run automatically)
                    </label>
                  </div>

                  {/* Secrets Section */}
                  <div className="border-t border-slate-200 pt-4">
                    <h3 className="text-lg font-semibold text-slate-900 mb-4">Secrets</h3>
                    
                    {/* Existing Secrets */}
                    {Object.keys(createSecrets).length > 0 && (
                      <div className="space-y-2 mb-4">
                        {Object.entries(createSecrets).map(([key, value]) => (
                          <div
                            key={key}
                            className="p-3 border border-slate-200 rounded-lg bg-slate-50 flex items-center justify-between"
                          >
                            <div className="flex-1">
                              <div className="text-sm font-medium text-slate-900">{key}</div>
                              <div className="text-xs text-slate-500 font-mono mt-1">••••••••</div>
                            </div>
                            <button
                              type="button"
                              onClick={() => handleRemoveCreateSecret(key)}
                              className="px-2 py-1 text-xs text-red-600 hover:text-red-900"
                              title="Remove"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                              </svg>
                            </button>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Add New Secret Form */}
                    <div className="space-y-3">
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">
                          Key
                        </label>
                        <input
                          type="text"
                          value={createSecretKey}
                          onChange={(e) => setCreateSecretKey(e.target.value)}
                          className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                          placeholder="e.g., API_KEY"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">
                          Value
                        </label>
                        <input
                          type="password"
                          value={createSecretValue}
                          onChange={(e) => setCreateSecretValue(e.target.value)}
                          className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                          placeholder="Enter secret value"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={handleAddCreateSecret}
                        className="px-4 py-2 text-sm bg-slate-200 text-slate-700 rounded-lg hover:bg-slate-300"
                      >
                        Add Secret
                      </button>
                    </div>
                    <p className="mt-2 text-xs text-slate-500">
                      Add secrets that will be available to your data source script (e.g., API keys, tokens)
                    </p>
                  </div>

                  <div className="flex gap-2">
                    <button
                      type="submit"
                      disabled={createDataSourceMutation.isPending}
                      className="flex-1 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50"
                    >
                      {createDataSourceMutation.isPending ? "Creating..." : "Create Data Source"}
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
                      className="px-4 py-2 bg-slate-200 text-slate-700 rounded-lg hover:bg-slate-300"
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              </div>
            ) : selectedDataSourceId && dataSourceData ? (
              <div className="bg-white border border-slate-200 rounded-lg p-6">
                <div className="flex justify-between items-start mb-6">
                  <div className="flex-1">
                    <div className="flex items-center gap-3">
                      <h2 className="text-2xl font-bold text-slate-900">{dataSourceData.name}</h2>
                      {runningStatusData?.runningStatus[selectedDataSourceId!] && (
                        <div className="flex items-center gap-2 px-3 py-1 bg-blue-100 text-blue-800 rounded-lg text-sm font-medium">
                          <svg className="w-4 h-4 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                          </svg>
                          <span>Running</span>
                        </div>
                      )}
                    </div>
                    {dataSourceData.description && (
                      <p className="text-slate-600 mt-1">{dataSourceData.description}</p>
                    )}
                    {runningStatusData?.runningStatus[selectedDataSourceId!] && runningStatusData?.runningLogs[selectedDataSourceId!]?.message && (
                      <p className="text-sm text-blue-600 mt-2">
                        {runningStatusData.runningLogs[selectedDataSourceId!]?.message}
                      </p>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={handleTriggerDataSource}
                      disabled={triggerDataSourceMutation.isPending}
                      className="px-4 py-2 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50"
                    >
                      {triggerDataSourceMutation.isPending ? "Triggering..." : "Run Now"}
                    </button>
                    <button
                      onClick={handleDeleteDataSource}
                      disabled={deleteDataSourceMutation.isPending}
                      className="px-4 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
                    >
                      Delete
                    </button>
                  </div>
                </div>

                <div className="space-y-4 mb-6">
                  <div className="flex items-center gap-4">
                    <div>
                      <span className="text-sm text-slate-500">Status:</span>
                      <span className={`ml-2 px-2 py-1 text-xs font-medium rounded ${
                        dataSourceData.enabled ? "bg-green-100 text-green-800" : "bg-slate-100 text-slate-800"
                      }`}>
                        {dataSourceData.enabled ? "Enabled" : "Disabled"}
                      </span>
                    </div>
                    <div>
                      <span className="text-sm text-slate-500">Schedule:</span>
                      <span className="ml-2 text-sm font-medium">{dataSourceData.schedule}</span>
                    </div>
                  </div>
                  {dataSourceData.last_run_at && (
                    <div>
                      <span className="text-sm text-slate-500">Last Run:</span>
                      <span className="ml-2 text-sm">{new Date(dataSourceData.last_run_at).toLocaleString()}</span>
                    </div>
                  )}
                  {dataSourceData.next_run_at && (
                    <div>
                      <span className="text-sm text-slate-500">Next Run:</span>
                      <span className="ml-2 text-sm">{new Date(dataSourceData.next_run_at).toLocaleString()}</span>
                    </div>
                  )}
                </div>

                <form onSubmit={handleUpdateDataSource} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">
                      Name
                    </label>
                    <input
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="w-full px-4 py-2 border border-slate-300 rounded-lg"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">
                      Description
                    </label>
                    <textarea
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      className="w-full px-4 py-2 border border-slate-300 rounded-lg"
                      rows={3}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">
                      Schedule
                    </label>
                    <input
                      type="text"
                      value={schedule}
                      onChange={(e) => setSchedule(e.target.value)}
                      className="w-full px-4 py-2 border border-slate-300 rounded-lg"
                      required
                    />
                    <p className="mt-1 text-xs text-slate-500">
                      Examples: "every 6 hours", "every 1 day", "0 */6 * * *" (cron)
                    </p>
                  </div>
                  <div className="flex items-center">
                    <input
                      type="checkbox"
                      id="update-enabled"
                      checked={enabled}
                      onChange={(e) => setEnabled(e.target.checked)}
                      className="w-4 h-4 text-indigo-600 border-slate-300 rounded focus:ring-indigo-500"
                    />
                    <label htmlFor="update-enabled" className="ml-2 text-sm text-slate-700">
                      Enabled (run automatically)
                    </label>
                  </div>
                  {dataSourceData.definition_file && (
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-2">
                        Definition File
                      </label>
                      <div className="px-4 py-2 border border-slate-300 rounded-lg bg-slate-50">
                        <p className="text-sm">{dataSourceData.definition_file.original_filename}</p>
                        <p className="text-xs text-slate-500 mt-1">
                          {(dataSourceData.definition_file.size / 1024).toFixed(2)} KB
                        </p>
                      </div>
                    </div>
                  )}
                  <button
                    type="submit"
                    disabled={updateDataSourceMutation.isPending}
                    className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50"
                  >
                    {updateDataSourceMutation.isPending ? "Saving..." : "Save Changes"}
                  </button>
                </form>

                {/* Secrets Management Section */}
                <div className="mt-8 border-t border-slate-200 pt-6">
                  <div className="flex justify-between items-center mb-4">
                    <h3 className="text-lg font-semibold text-slate-900">Secrets</h3>
                  </div>
                  
                  {/* Existing Secrets */}
                  {dataSourceData.secrets && Object.keys(dataSourceData.secrets).length > 0 ? (
                    <div className="space-y-3 mb-6">
                      {Object.entries(dataSourceData.secrets).map(([key, value]) => (
                        <div
                          key={key}
                          className="p-4 border border-slate-200 rounded-lg bg-slate-50"
                        >
                          {editingSecretKey === key ? (
                            <div className="space-y-3">
                              <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">
                                  Key
                                </label>
                                <div className="px-3 py-2 bg-slate-100 border border-slate-300 rounded-lg text-sm text-slate-600">
                                  {key}
                                </div>
                              </div>
                              <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">
                                  Value
                                </label>
                                <input
                                  type="password"
                                  value={editingSecretValue}
                                  onChange={(e) => setEditingSecretValue(e.target.value)}
                                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                                  placeholder="Enter secret value"
                                />
                              </div>
                              <div className="flex gap-2">
                                <button
                                  onClick={() => handleUpdateSecret(key)}
                                  disabled={updateSecretMutation.isPending}
                                  className="px-3 py-1 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50"
                                >
                                  {updateSecretMutation.isPending ? "Saving..." : "Save"}
                                </button>
                                <button
                                  onClick={() => {
                                    setEditingSecretKey(null);
                                    setEditingSecretValue("");
                                  }}
                                  className="px-3 py-1 text-sm bg-slate-200 text-slate-700 rounded-lg hover:bg-slate-300"
                                >
                                  Cancel
                                </button>
                              </div>
                            </div>
                          ) : (
                            <div className="flex items-center justify-between">
                              <div className="flex-1">
                                <div className="text-sm font-medium text-slate-900 mb-1">{key}</div>
                                <div className="text-sm text-slate-600 font-mono">
                                  {visibleSecrets.has(key) ? (
                                    <span>{value}</span>
                                  ) : (
                                    <span className="text-slate-400">••••••••</span>
                                  )}
                                </div>
                              </div>
                              <div className="flex gap-2">
                                <button
                                  onClick={() => toggleSecretVisibility(key)}
                                  className="px-2 py-1 text-xs text-slate-600 hover:text-slate-900"
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
                                  className="px-2 py-1 text-xs text-indigo-600 hover:text-indigo-900"
                                  title="Edit"
                                >
                                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                  </svg>
                                </button>
                                <button
                                  onClick={() => handleDeleteSecret(key)}
                                  disabled={deleteSecretMutation.isPending}
                                  className="px-2 py-1 text-xs text-red-600 hover:text-red-900"
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
                      ))}
                    </div>
                  ) : (
                    <div className="text-sm text-slate-500 mb-6">No secrets configured</div>
                  )}

                  {/* Add New Secret Form */}
                  <div className="border-t border-slate-200 pt-4">
                    <h4 className="text-sm font-semibold text-slate-900 mb-3">Add New Secret</h4>
                    <form onSubmit={handleAddSecret} className="space-y-3">
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">
                          Key
                        </label>
                        <input
                          type="text"
                          value={newSecretKey}
                          onChange={(e) => setNewSecretKey(e.target.value)}
                          className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                          placeholder="e.g., API_KEY"
                          required
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">
                          Value
                        </label>
                        <input
                          type="password"
                          value={newSecretValue}
                          onChange={(e) => setNewSecretValue(e.target.value)}
                          className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                          placeholder="Enter secret value"
                          required
                        />
                      </div>
                      <button
                        type="submit"
                        disabled={addSecretMutation.isPending}
                        className="px-4 py-2 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50"
                      >
                        {addSecretMutation.isPending ? "Adding..." : "Add Secret"}
                      </button>
                    </form>
                  </div>
                </div>

                {/* Execution Logs Section */}
                <div className="mt-8 border-t border-slate-200 pt-6">
                  <div className="flex justify-between items-center mb-4">
                    <h3 className="text-lg font-semibold text-slate-900">Execution Logs</h3>
                    <button
                      onClick={() => refetchLogs()}
                      className="text-sm text-slate-600 hover:text-slate-900"
                    >
                      Refresh
                    </button>
                  </div>
                  
                  {logsLoading ? (
                    <div className="text-sm text-slate-500 py-4">Loading logs...</div>
                  ) : !logsData || logsData.logs.length === 0 ? (
                    <div className="text-sm text-slate-500 py-4">No execution logs yet</div>
                  ) : (
                    <>
                      <div className="space-y-3">
                        {logsData.logs.map((log) => (
                          <div
                            key={log.id}
                            className={`p-4 rounded-lg border ${
                              log.status === "success"
                                ? "bg-green-50 border-green-200"
                                : log.status === "error"
                                ? "bg-red-50 border-red-200"
                                : log.status === "running"
                                ? "bg-blue-50 border-blue-200"
                                : "bg-slate-50 border-slate-200"
                            }`}
                          >
                            <div className="flex items-start justify-between">
                              <div className="flex-1">
                                <div className="flex items-center gap-2 mb-1">
                                  <span
                                    className={`px-2 py-1 text-xs font-medium rounded ${
                                      log.status === "success"
                                        ? "bg-green-100 text-green-800"
                                        : log.status === "error"
                                        ? "bg-red-100 text-red-800"
                                        : log.status === "running"
                                        ? "bg-blue-100 text-blue-800"
                                        : "bg-slate-100 text-slate-800"
                                    }`}
                                  >
                                    {log.status.toUpperCase()}
                                  </span>
                                  <span className="text-xs text-slate-500">
                                    {log.status === "running" 
                                      ? new Date(log.created_at).toLocaleString()
                                      : (log.updated_at 
                                          ? new Date(log.updated_at).toLocaleString()
                                          : new Date(log.created_at).toLocaleString())}
                                  </span>
                                </div>
                                {log.message && (
                                  <p className="text-sm text-slate-900 mb-1">{log.message}</p>
                                )}
                                {log.error && (
                                  <p className="text-sm text-red-600 mt-1 font-mono text-xs">
                                    {log.error}
                                  </p>
                                )}
                                {log.details?.progress && Array.isArray(log.details.progress) && log.details.progress.length > 0 && (
                                  <div className="mt-3 pt-3 border-t border-slate-200">
                                    <p className="text-xs font-medium text-slate-700 mb-2">Progress:</p>
                                    <div className="space-y-1.5 max-h-48 overflow-y-auto">
                                      {log.details.progress.map((entry: any, idx: number) => (
                                        <div key={idx} className="text-xs text-slate-600 pl-3 border-l-2 border-slate-300">
                                          <div className="flex items-start gap-2">
                                            <span className="text-slate-400 font-mono text-[10px] mt-0.5">
                                              {entry.timestamp ? new Date(entry.timestamp).toLocaleTimeString() : ''}
                                            </span>
                                            <span className="flex-1">{entry.message}</span>
                                          </div>
                                          {entry.metadata && Object.keys(entry.metadata).length > 0 && (
                                            <div className="mt-1 ml-5 text-[10px] text-slate-500 font-mono">
                                              {JSON.stringify(entry.metadata, null, 2)}
                                            </div>
                                          )}
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                )}
                                <div className="flex gap-4 mt-2 text-xs text-slate-500">
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
                        ))}
                      </div>
                      
                      {/* Logs Pagination */}
                      {logsData.total > logsLimit && (
                        <div className="mt-4 flex items-center justify-between">
                          <button
                            onClick={() => setLogsPage(Math.max(0, logsPage - 1))}
                            disabled={logsPage === 0}
                            className="px-3 py-1 text-sm border border-slate-300 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-50"
                          >
                            Previous
                          </button>
                          <span className="text-sm text-slate-600">
                            Page {logsPage + 1} of {Math.ceil(logsData.total / logsLimit)}
                          </span>
                          <button
                            onClick={() => setLogsPage(Math.min(Math.ceil(logsData.total / logsLimit) - 1, logsPage + 1))}
                            disabled={logsPage >= Math.ceil(logsData.total / logsLimit) - 1}
                            className="px-3 py-1 text-sm border border-slate-300 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-50"
                          >
                            Next
                          </button>
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>
            ) : (
              <div className="bg-white border border-slate-200 rounded-lg p-12 text-center">
                <p className="text-slate-500">Select a data source to view details or create a new one</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </AppLayout>
  );
}

