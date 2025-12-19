"use client";

import { trpc } from "../../utils/trpc";
import { useRouter } from "next/navigation";
import { useState, useEffect, useRef } from "react";
import { Navigation } from "../components/Navigation";

export default function DataSourcesPage() {
  const router = useRouter();
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
  const limit = 20;

  const { data: userData, isLoading: userLoading } = trpc.auth.me.useQuery();
  const { data: dataSourcesData, isLoading: dataSourcesLoading, refetch: refetchDataSources } = trpc.dataSources.list.useQuery({
    limit,
    offset: page * limit,
  });

  const { data: dataSourceData, refetch: refetchDataSource } = trpc.dataSources.getById.useQuery(
    { id: selectedDataSourceId! },
    { enabled: !!selectedDataSourceId },
  );

  const createDataSourceMutation = trpc.dataSources.create.useMutation({
    onSuccess: () => {
      setName("");
      setDescription("");
      setSchedule("every 6 hours");
      setEnabled(true);
      setDefinitionFile(null);
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
      refetchDataSources();
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
    },
    onError: (error) => {
      setToastMessage(`Failed to trigger data source: ${error.message}`);
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
      });
    } catch (error: any) {
      setToastMessage(`Failed to process file: ${error.message}`);
      setTimeout(() => setToastMessage(null), 3000);
    }
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
    <div className="min-h-screen bg-white">
      <Navigation />
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
                  dataSources.map((ds) => (
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
                        <div className="font-medium">{ds.name}</div>
                        <div className={`w-2 h-2 rounded-full ${ds.enabled ? "bg-green-500" : "bg-slate-300"}`} />
                      </div>
                      {ds.description && (
                        <div className="text-xs text-slate-500 mt-1 line-clamp-1">{ds.description}</div>
                      )}
                      <div className="text-xs text-slate-400 mt-1">Schedule: {ds.schedule}</div>
                    </button>
                  ))
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
                  <div>
                    <h2 className="text-2xl font-bold text-slate-900">{dataSourceData.name}</h2>
                    {dataSourceData.description && (
                      <p className="text-slate-600 mt-1">{dataSourceData.description}</p>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={handleTriggerDataSource}
                      disabled={triggerDataSourceMutation.isPending || !dataSourceData.enabled}
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
              </div>
            ) : (
              <div className="bg-white border border-slate-200 rounded-lg p-12 text-center">
                <p className="text-slate-500">Select a data source to view details or create a new one</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

