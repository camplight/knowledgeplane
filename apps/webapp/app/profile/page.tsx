"use client";

import { trpc } from "../../utils/trpc";
import { useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import { Navigation } from "../components/Navigation";

export default function ProfilePage() {
  const router = useRouter();
  const [isEditing, setIsEditing] = useState(false);
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [showApiKey, setShowApiKey] = useState(false);
  const [apiKeyCopied, setApiKeyCopied] = useState(false);
  const [mcpUrlCopied, setMcpUrlCopied] = useState(false);
  const [showRestApiKey, setShowRestApiKey] = useState(false);
  const [restApiKeyCopied, setRestApiKeyCopied] = useState(false);
  const [restApiUrlCopied, setRestApiUrlCopied] = useState(false);
  const [restApiUrl, setRestApiUrl] = useState<string | null>(null);
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const { data: userData, isLoading: userLoading, refetch: refetchProfile } = trpc.auth.me.useQuery();
  const { data: profileData, refetch: refetchUserProfile } = trpc.user.getProfile.useQuery(undefined, {
    enabled: !!userData?.user,
  });
  const { data: workspacesData } = trpc.workspaces.list.useQuery(undefined, {
    enabled: !!userData?.user,
  });
  const { data: restApiKeyData, refetch: refetchRestApiKey } =
    trpc.workspaces.getRestApiKey.useQuery(
      { workspace_id: selectedWorkspaceId || "" },
      {
        enabled: !!userData?.user && !!selectedWorkspaceId,
      },
    );
  const { data: mcpUrlData } = trpc.user.getMcpUrl.useQuery(
    { workspaceId: selectedWorkspaceId || undefined },
    {
      enabled: !!userData?.user && !!profileData?.api_key,
    },
  );

  const updateProfileMutation = trpc.user.updateProfile.useMutation({
    onSuccess: () => {
      setSuccess("Profile updated successfully!");
      setError(null);
      setIsEditing(false);
      refetchProfile();
      refetchUserProfile();
      setTimeout(() => setSuccess(null), 3000);
    },
    onError: (error) => {
      setError(error.message);
      setSuccess(null);
    },
  });

  const generateApiKeyMutation = trpc.user.generateApiKey.useMutation({
    onSuccess: () => {
      setSuccess("API key generated successfully!");
      setError(null);
      refetchUserProfile();
      setTimeout(() => setSuccess(null), 3000);
    },
    onError: (error) => {
      setError(error.message);
      setSuccess(null);
    },
  });

  const removeApiKeyMutation = trpc.user.removeApiKey.useMutation({
    onSuccess: () => {
      setSuccess("API key removed successfully!");
      setError(null);
      setShowApiKey(false);
      refetchUserProfile();
      setTimeout(() => setSuccess(null), 3000);
    },
    onError: (error) => {
      setError(error.message);
      setSuccess(null);
    },
  });

  const generateRestApiKeyMutation = trpc.workspaces.generateRestApiKey.useMutation({
    onSuccess: () => {
      setSuccess("REST API key generated successfully!");
      setError(null);
      refetchRestApiKey();
      setTimeout(() => setSuccess(null), 3000);
    },
    onError: (error) => {
      setError(error.message);
      setSuccess(null);
    },
  });

  const removeRestApiKeyMutation = trpc.workspaces.removeRestApiKey.useMutation({
    onSuccess: () => {
      setSuccess("REST API key removed successfully!");
      setError(null);
      setShowRestApiKey(false);
      refetchRestApiKey();
      setTimeout(() => setSuccess(null), 3000);
    },
    onError: (error) => {
      setError(error.message);
      setSuccess(null);
    },
  });

  useEffect(() => {
    if (!userLoading && !userData?.user) {
      router.push("/");
    }
  }, [userLoading, userData, router]);

  useEffect(() => {
    if (profileData) {
      setUsername(profileData.username);
      setEmail(profileData.email);
    }
  }, [profileData]);

  // Set default workspace when workspaces are loaded
  useEffect(() => {
    if (workspacesData && workspacesData.length > 0 && !selectedWorkspaceId) {
      // Use current workspace if available, otherwise use first workspace
      const currentWorkspaceId = userData?.currentWorkspaceId;
      const defaultWorkspaceId = currentWorkspaceId && workspacesData.some(w => w.id === currentWorkspaceId)
        ? currentWorkspaceId
        : workspacesData[0].id;
      setSelectedWorkspaceId(defaultWorkspaceId);
    }
  }, [workspacesData, userData, selectedWorkspaceId]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!restApiKeyData?.api_key) {
      setRestApiUrl(null);
      return;
    }

    const url = new URL(`${window.location.origin}/api`);
    url.searchParams.set("api_key", restApiKeyData.api_key);
    if (selectedWorkspaceId) {
      url.searchParams.set("workspace_id", selectedWorkspaceId);
    }
    setRestApiUrl(url.toString());
  }, [restApiKeyData?.api_key, selectedWorkspaceId]);

  const handleSave = () => {
    setError(null);
    setSuccess(null);
    if (!username.trim() || !email.trim()) {
      setError("Username and email are required");
      return;
    }
    updateProfileMutation.mutate({
      username: username.trim(),
      email: email.trim(),
    });
  };

  const handleCancel = () => {
    if (profileData) {
      setUsername(profileData.username);
      setEmail(profileData.email);
    }
    setIsEditing(false);
    setError(null);
    setSuccess(null);
  };

  const handleCopyApiKey = () => {
    if (profileData?.api_key) {
      navigator.clipboard.writeText(profileData.api_key);
      setApiKeyCopied(true);
      setTimeout(() => setApiKeyCopied(false), 2000);
    }
  };

  const handleCopyMcpUrl = () => {
    if (mcpUrlData?.url) {
      navigator.clipboard.writeText(mcpUrlData.url);
      setMcpUrlCopied(true);
      setTimeout(() => setMcpUrlCopied(false), 2000);
    }
  };

  const handleCopyRestApiKey = () => {
    if (restApiKeyData?.api_key) {
      navigator.clipboard.writeText(restApiKeyData.api_key);
      setRestApiKeyCopied(true);
      setTimeout(() => setRestApiKeyCopied(false), 2000);
    }
  };

  const handleCopyRestApiUrl = () => {
    if (restApiUrl) {
      navigator.clipboard.writeText(restApiUrl);
      setRestApiUrlCopied(true);
      setTimeout(() => setRestApiUrlCopied(false), 2000);
    }
  };

  const handleGenerateApiKey = () => {
    if (confirm("Are you sure you want to generate a new API key? The old key will be invalidated.")) {
      generateApiKeyMutation.mutate();
    }
  };

  const handleRemoveApiKey = () => {
    if (confirm("Are you sure you want to remove your API key? You won't be able to use it for authentication.")) {
      removeApiKeyMutation.mutate();
    }
  };

  const handleGenerateRestApiKey = () => {
    if (!selectedWorkspaceId) {
      setError("Select a workspace to generate a REST API key");
      return;
    }
    if (
      confirm(
        "Generate a new REST API key for this workspace? The old key will be invalidated.",
      )
    ) {
      generateRestApiKeyMutation.mutate({ workspace_id: selectedWorkspaceId });
    }
  };

  const handleRemoveRestApiKey = () => {
    if (!selectedWorkspaceId) {
      setError("Select a workspace to remove its REST API key");
      return;
    }
    if (
      confirm(
        "Remove the REST API key for this workspace? You can generate a new one later.",
      )
    ) {
      removeRestApiKeyMutation.mutate({ workspace_id: selectedWorkspaceId });
    }
  };

  if (userLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-xl text-slate-600">Loading...</div>
      </div>
    );
  }

  if (!userData?.user || !profileData) {
    return null;
  }

  return (
    <div className="min-h-screen bg-white">
      <Navigation />

      {/* Main Content */}
      <main className="container mx-auto px-4 sm:px-6 lg:px-8 py-8 max-w-4xl">
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-slate-900 mb-2">Profile Settings</h1>
          <p className="text-lg text-slate-600">
            Manage your account information and API keys
          </p>
        </div>

        {/* Success/Error Messages */}
        {success && (
          <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-lg text-green-800">
            {success}
          </div>
        )}
        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg text-red-800">
            {error}
          </div>
        )}

        {/* Profile Information Card */}
        <div className="bg-white rounded-xl shadow-lg border border-slate-200 mb-6">
          <div className="p-6 border-b border-slate-200">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-bold text-slate-900">Profile Information</h2>
                <p className="text-sm text-slate-600 mt-1">
                  Update your username and email address
                </p>
              </div>
              {!isEditing && (
                <button
                  onClick={() => setIsEditing(true)}
                  className="px-4 py-2 text-sm font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors"
                >
                  Edit Profile
                </button>
              )}
            </div>
          </div>

          <div className="p-6">
            {isEditing ? (
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    Username
                  </label>
                  <input
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="Username"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    Email
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="Email"
                  />
                </div>
                <div className="flex gap-3 pt-4">
                  <button
                    onClick={handleSave}
                    disabled={updateProfileMutation.isPending}
                    className="px-6 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {updateProfileMutation.isPending ? "Saving..." : "Save Changes"}
                  </button>
                  <button
                    onClick={handleCancel}
                    disabled={updateProfileMutation.isPending}
                    className="px-6 py-2 text-sm font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-500 mb-1">
                    Username
                  </label>
                  <p className="text-lg text-slate-900">{profileData.username}</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-500 mb-1">
                    Email
                  </label>
                  <p className="text-lg text-slate-900">{profileData.email}</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-500 mb-1">
                    Account Created
                  </label>
                  <p className="text-lg text-slate-900">
                    {new Date(profileData.created_at).toLocaleDateString()}
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* MCP API Key Management Card */}
        <div className="bg-white rounded-xl shadow-lg border border-slate-200 mb-6">
          <div className="p-6 border-b border-slate-200">
            <div>
              <h2 className="text-2xl font-bold text-slate-900">MCP API Key</h2>
              <p className="text-sm text-slate-600 mt-1">
                Generate and manage your personal API key for MCP access
              </p>
            </div>
          </div>

          <div className="p-6">
            {profileData.api_key ? (
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    API Key
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type={showApiKey ? "text" : "password"}
                      value={profileData.api_key}
                      readOnly
                      className="flex-1 px-4 py-2 border border-slate-300 rounded-lg bg-slate-50 font-mono text-sm"
                    />
                    <button
                      onClick={() => setShowApiKey(!showApiKey)}
                      className="px-4 py-2 text-sm font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
                    >
                      {showApiKey ? "Hide" : "Show"}
                    </button>
                    <button
                      onClick={handleCopyApiKey}
                      className="px-4 py-2 text-sm font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors"
                    >
                      {apiKeyCopied ? "Copied!" : "Copy"}
                    </button>
                  </div>
                  <p className="text-xs text-slate-500 mt-2">
                    Use this key in the <code className="bg-slate-100 px-1 py-0.5 rounded">knowledgeplane-key</code> header for API authentication
                  </p>
                </div>
                <div className="flex gap-3 pt-4">
                  <button
                    onClick={handleGenerateApiKey}
                    disabled={generateApiKeyMutation.isPending}
                    className="px-6 py-2 text-sm font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {generateApiKeyMutation.isPending ? "Generating..." : "Generate New Key"}
                  </button>
                  <button
                    onClick={handleRemoveApiKey}
                    disabled={removeApiKeyMutation.isPending}
                    className="px-6 py-2 text-sm font-medium text-red-700 bg-red-50 hover:bg-red-100 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {removeApiKeyMutation.isPending ? "Removing..." : "Remove Key"}
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <p className="text-slate-600">
                  You don't have an API key yet. Generate one to enable programmatic access to your knowledge base.
                </p>
                <button
                  onClick={handleGenerateApiKey}
                  disabled={generateApiKeyMutation.isPending}
                  className="px-6 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {generateApiKeyMutation.isPending ? "Generating..." : "Generate API Key"}
                </button>
              </div>
            )}
          </div>
        </div>

        {/* REST API Keys Card */}
        <div className="bg-white rounded-xl shadow-lg border border-slate-200 mb-6">
          <div className="p-6 border-b border-slate-200">
            <div>
              <h2 className="text-2xl font-bold text-slate-900">REST API Keys</h2>
              <p className="text-sm text-slate-600 mt-1">
                Generate per-workspace keys for the REST API
              </p>
            </div>
          </div>

          <div className="p-6">
            {workspacesData && workspacesData.length > 0 && (
              <div className="mb-4">
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Select Workspace
                </label>
                <select
                  value={selectedWorkspaceId || ""}
                  onChange={(e) => setSelectedWorkspaceId(e.target.value || null)}
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white"
                >
                  {workspacesData.map((workspace) => (
                    <option key={workspace.id} value={workspace.id}>
                      {workspace.name}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-slate-500 mt-1">
                  Choose which workspace the REST API key applies to
                </p>
              </div>
            )}

            {restApiKeyData?.api_key ? (
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    REST API Key
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type={showRestApiKey ? "text" : "password"}
                      value={restApiKeyData.api_key}
                      readOnly
                      className="flex-1 px-4 py-2 border border-slate-300 rounded-lg bg-slate-50 font-mono text-sm"
                    />
                    <button
                      onClick={() => setShowRestApiKey(!showRestApiKey)}
                      className="px-4 py-2 text-sm font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
                    >
                      {showRestApiKey ? "Hide" : "Show"}
                    </button>
                    <button
                      onClick={handleCopyRestApiKey}
                      className="px-4 py-2 text-sm font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors"
                    >
                      {restApiKeyCopied ? "Copied!" : "Copy"}
                    </button>
                  </div>
                  <p className="text-xs text-slate-500 mt-2">
                    Use this key in the{" "}
                    <code className="bg-slate-100 px-1 py-0.5 rounded">
                      knowledgeplane-key
                    </code>{" "}
                    header or as the <code className="bg-slate-100 px-1 py-0.5 rounded">api_key</code> query parameter
                  </p>
                </div>
                {restApiUrl && (
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">
                      REST API URL
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={restApiUrl}
                        readOnly
                        className="flex-1 px-4 py-2 border border-slate-300 rounded-lg bg-slate-50 font-mono text-xs break-all"
                      />
                      <button
                        onClick={handleCopyRestApiUrl}
                        className="px-4 py-2 text-sm font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors whitespace-nowrap"
                      >
                        {restApiUrlCopied ? "Copied!" : "Copy URL"}
                      </button>
                    </div>
                    <p className="text-xs text-slate-500 mt-2">
                      Includes your workspace context and API key for quick REST calls.
                    </p>
                  </div>
                )}
                <div className="flex gap-3 pt-4">
                  <button
                    onClick={handleGenerateRestApiKey}
                    disabled={generateRestApiKeyMutation.isPending}
                    className="px-6 py-2 text-sm font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {generateRestApiKeyMutation.isPending ? "Generating..." : "Generate New Key"}
                  </button>
                  <button
                    onClick={handleRemoveRestApiKey}
                    disabled={removeRestApiKeyMutation.isPending}
                    className="px-6 py-2 text-sm font-medium text-red-700 bg-red-50 hover:bg-red-100 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {removeRestApiKeyMutation.isPending ? "Removing..." : "Remove Key"}
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <p className="text-slate-600">
                  No REST API key for this workspace yet. Generate one to enable REST API access.
                </p>
                <button
                  onClick={handleGenerateRestApiKey}
                  disabled={generateRestApiKeyMutation.isPending}
                  className="px-6 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {generateRestApiKeyMutation.isPending ? "Generating..." : "Generate REST API Key"}
                </button>
              </div>
            )}
          </div>
        </div>

        {/* MCP Server URL Card */}
        {profileData.api_key && (
          <div className="bg-white rounded-xl shadow-lg border border-slate-200">
            <div className="p-6 border-b border-slate-200">
              <div>
                <h2 className="text-2xl font-bold text-slate-900">MCP Server URL</h2>
                <p className="text-sm text-slate-600 mt-1">
                  Copy your personal MCP server URL with your API key and workspace context included
                </p>
              </div>
            </div>

            <div className="p-6">
              {mcpUrlData?.url ? (
                <div className="space-y-4">
                  {workspacesData && workspacesData.length > 0 && (
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-2">
                        Select Workspace
                      </label>
                      <select
                        value={selectedWorkspaceId || ""}
                        onChange={(e) => setSelectedWorkspaceId(e.target.value || null)}
                        className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white"
                      >
                        {workspacesData.map((workspace) => (
                          <option key={workspace.id} value={workspace.id}>
                            {workspace.name}
                          </option>
                        ))}
                      </select>
                      <p className="text-xs text-slate-500 mt-1">
                        Choose which workspace's context to include in the MCP URL
                      </p>
                    </div>
                  )}
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">
                      MCP Server URL
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={mcpUrlData.url}
                        readOnly
                        className="flex-1 px-4 py-2 border border-slate-300 rounded-lg bg-slate-50 font-mono text-xs break-all"
                      />
                      <button
                        onClick={handleCopyMcpUrl}
                        className="px-4 py-2 text-sm font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors whitespace-nowrap"
                      >
                        {mcpUrlCopied ? "Copied!" : "Copy URL"}
                      </button>
                    </div>
                    <p className="text-xs text-slate-500 mt-2">
                      Use this URL to connect AI agents and tools to your KnowledgePlane MCP server. Your API key and workspace context are included in the URL.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <p className="text-slate-600">
                    Generate an API key to get your MCP server URL.
                  </p>
                </div>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

