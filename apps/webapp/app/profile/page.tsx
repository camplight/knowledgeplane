"use client";

import { trpc } from "../../utils/trpc";
import { useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import { AppLayout } from "../components/AppLayout";

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
      <AppLayout>
        <div className="text-xl text-base-content">Loading...</div>
      </AppLayout>
    );
  }

  if (!userData?.user || !profileData) {
    return null;
  }

  return (
    <AppLayout>
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-8 max-w-4xl">
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-base-content mb-2">Profile Settings</h1>
          <p className="text-lg text-base-content/70">
            Manage your account information and API keys
          </p>
        </div>

        {/* Success/Error Messages */}
        {success && (
          <div className="alert alert-success mb-6">
            <svg xmlns="http://www.w3.org/2000/svg" className="stroke-current shrink-0 h-6 w-6" fill="none" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            <span>{success}</span>
          </div>
        )}
        {error && (
          <div className="alert alert-error mb-6">
            <svg xmlns="http://www.w3.org/2000/svg" className="stroke-current shrink-0 h-6 w-6" fill="none" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            <span>{error}</span>
          </div>
        )}

        {/* Profile Information Card */}
        <div className="card bg-base-100 shadow-xl border border-base-300 mb-6">
          <div className="card-body border-b border-base-300">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="card-title text-2xl">Profile Information</h2>
                <p className="text-sm text-base-content/70 mt-1">
                  Update your username and email address
                </p>
              </div>
              {!isEditing && (
                <button
                  onClick={() => setIsEditing(true)}
                  className="btn btn-sm btn-primary"
                >
                  Edit Profile
                </button>
              )}
            </div>
          </div>

          <div className="card-body">
            {isEditing ? (
              <div className="space-y-4">
                <div className="form-control">
                  <label className="label">
                    <span className="label-text">Username</span>
                  </label>
                  <input
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    className="input input-bordered w-full"
                    placeholder="Username"
                  />
                </div>
                <div className="form-control">
                  <label className="label">
                    <span className="label-text">Email</span>
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="input input-bordered w-full"
                    placeholder="Email"
                  />
                </div>
                <div className="flex gap-3 pt-4">
                  <button
                    onClick={handleSave}
                    disabled={updateProfileMutation.isPending}
                    className="btn btn-primary"
                  >
                    {updateProfileMutation.isPending ? "Saving..." : "Save Changes"}
                  </button>
                  <button
                    onClick={handleCancel}
                    disabled={updateProfileMutation.isPending}
                    className="btn btn-ghost"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div>
                  <label className="label">
                    <span className="label-text text-base-content/70">Username</span>
                  </label>
                  <p className="text-lg text-base-content">{profileData.username}</p>
                </div>
                <div>
                  <label className="label">
                    <span className="label-text text-base-content/70">Email</span>
                  </label>
                  <p className="text-lg text-base-content">{profileData.email}</p>
                </div>
                <div>
                  <label className="label">
                    <span className="label-text text-base-content/70">Account Created</span>
                  </label>
                  <p className="text-lg text-base-content">
                    {new Date(profileData.created_at).toLocaleDateString()}
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* MCP API Key Management Card */}
        <div className="card bg-base-100 shadow-xl border border-base-300 mb-6">
          <div className="card-body border-b border-base-300">
            <div>
              <h2 className="card-title text-2xl">MCP API Key</h2>
              <p className="text-sm text-base-content/70 mt-1">
                Generate and manage your personal API key for MCP access
              </p>
            </div>
          </div>

          <div className="card-body">
            {profileData.api_key ? (
              <div className="space-y-4">
                <div className="form-control">
                  <label className="label">
                    <span className="label-text">API Key</span>
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type={showApiKey ? "text" : "password"}
                      value={profileData.api_key}
                      readOnly
                      className="input input-bordered flex-1 font-mono text-sm bg-base-200"
                    />
                    <button
                      onClick={() => setShowApiKey(!showApiKey)}
                      className="btn btn-ghost btn-sm"
                    >
                      {showApiKey ? "Hide" : "Show"}
                    </button>
                    <button
                      onClick={handleCopyApiKey}
                      className="btn btn-primary btn-sm"
                    >
                      {apiKeyCopied ? "Copied!" : "Copy"}
                    </button>
                  </div>
                  <label className="label">
                    <span className="label-text-alt text-base-content/60">
                      Use this key in the <kbd className="kbd kbd-sm">knowledgeplane-key</kbd> header for API authentication
                    </span>
                  </label>
                </div>
                <div className="flex gap-3 pt-4">
                  <button
                    onClick={handleGenerateApiKey}
                    disabled={generateApiKeyMutation.isPending}
                    className="btn btn-primary btn-sm"
                  >
                    {generateApiKeyMutation.isPending ? "Generating..." : "Generate New Key"}
                  </button>
                  <button
                    onClick={handleRemoveApiKey}
                    disabled={removeApiKeyMutation.isPending}
                    className="btn btn-error btn-sm"
                  >
                    {removeApiKeyMutation.isPending ? "Removing..." : "Remove Key"}
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <p className="text-base-content/70">
                  You don't have an API key yet. Generate one to enable programmatic access to your knowledge base.
                </p>
                <button
                  onClick={handleGenerateApiKey}
                  disabled={generateApiKeyMutation.isPending}
                  className="btn btn-primary"
                >
                  {generateApiKeyMutation.isPending ? "Generating..." : "Generate API Key"}
                </button>
              </div>
            )}
          </div>
        </div>

        {/* REST API Keys Card */}
        <div className="card bg-base-100 shadow-xl border border-base-300 mb-6">
          <div className="card-body border-b border-base-300">
            <div>
              <h2 className="card-title text-2xl">REST API Keys</h2>
              <p className="text-sm text-base-content/70 mt-1">
                Generate per-workspace keys for the REST API
              </p>
            </div>
          </div>

          <div className="card-body">
            {workspacesData && workspacesData.length > 0 && (
              <div className="form-control mb-4">
                <label className="label">
                  <span className="label-text">Select Workspace</span>
                </label>
                <select
                  value={selectedWorkspaceId || ""}
                  onChange={(e) => setSelectedWorkspaceId(e.target.value || null)}
                  className="select select-bordered w-full"
                >
                  {workspacesData.map((workspace) => (
                    <option key={workspace.id} value={workspace.id}>
                      {workspace.name}
                    </option>
                  ))}
                </select>
                <label className="label">
                  <span className="label-text-alt text-base-content/60">
                    Choose which workspace the REST API key applies to
                  </span>
                </label>
              </div>
            )}

            {restApiKeyData?.api_key ? (
              <div className="space-y-4">
                <div className="form-control">
                  <label className="label">
                    <span className="label-text">REST API Key</span>
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type={showRestApiKey ? "text" : "password"}
                      value={restApiKeyData.api_key}
                      readOnly
                      className="input input-bordered flex-1 font-mono text-sm bg-base-200"
                    />
                    <button
                      onClick={() => setShowRestApiKey(!showRestApiKey)}
                      className="btn btn-ghost btn-sm"
                    >
                      {showRestApiKey ? "Hide" : "Show"}
                    </button>
                    <button
                      onClick={handleCopyRestApiKey}
                      className="btn btn-primary btn-sm"
                    >
                      {restApiKeyCopied ? "Copied!" : "Copy"}
                    </button>
                  </div>
                  <label className="label">
                    <span className="label-text-alt text-base-content/60">
                      Use this key in the{" "}
                      <kbd className="kbd kbd-sm">knowledgeplane-key</kbd>{" "}
                      header or as the <kbd className="kbd kbd-sm">api_key</kbd> query parameter
                    </span>
                  </label>
                </div>
                {restApiUrl && (
                  <div className="form-control">
                    <label className="label">
                      <span className="label-text">REST API URL</span>
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={restApiUrl}
                        readOnly
                        className="input input-bordered flex-1 font-mono text-xs break-all bg-base-200"
                      />
                      <button
                        onClick={handleCopyRestApiUrl}
                        className="btn btn-primary btn-sm whitespace-nowrap"
                      >
                        {restApiUrlCopied ? "Copied!" : "Copy URL"}
                      </button>
                    </div>
                    <label className="label">
                      <span className="label-text-alt text-base-content/60">
                        Includes your workspace context and API key for quick REST calls.
                      </span>
                    </label>
                  </div>
                )}
                <div className="flex gap-3 pt-4">
                  <button
                    onClick={handleGenerateRestApiKey}
                    disabled={generateRestApiKeyMutation.isPending}
                    className="btn btn-primary btn-sm"
                  >
                    {generateRestApiKeyMutation.isPending ? "Generating..." : "Generate New Key"}
                  </button>
                  <button
                    onClick={handleRemoveRestApiKey}
                    disabled={removeRestApiKeyMutation.isPending}
                    className="btn btn-error btn-sm"
                  >
                    {removeRestApiKeyMutation.isPending ? "Removing..." : "Remove Key"}
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <p className="text-base-content/70">
                  No REST API key for this workspace yet. Generate one to enable REST API access.
                </p>
                <button
                  onClick={handleGenerateRestApiKey}
                  disabled={generateRestApiKeyMutation.isPending}
                  className="btn btn-primary"
                >
                  {generateRestApiKeyMutation.isPending ? "Generating..." : "Generate REST API Key"}
                </button>
              </div>
            )}
          </div>
        </div>

        {/* MCP Server URL Card */}
        {profileData.api_key && (
          <div className="card bg-base-100 shadow-xl border border-base-300">
            <div className="card-body border-b border-base-300">
              <div>
                <h2 className="card-title text-2xl">MCP Server URL</h2>
                <p className="text-sm text-base-content/70 mt-1">
                  Copy your personal MCP server URL with your API key and workspace context included
                </p>
              </div>
            </div>

            <div className="card-body">
              {mcpUrlData?.url ? (
                <div className="space-y-4">
                  {workspacesData && workspacesData.length > 0 && (
                    <div className="form-control">
                      <label className="label">
                        <span className="label-text">Select Workspace</span>
                      </label>
                      <select
                        value={selectedWorkspaceId || ""}
                        onChange={(e) => setSelectedWorkspaceId(e.target.value || null)}
                        className="select select-bordered w-full"
                      >
                        {workspacesData.map((workspace) => (
                          <option key={workspace.id} value={workspace.id}>
                            {workspace.name}
                          </option>
                        ))}
                      </select>
                      <label className="label">
                        <span className="label-text-alt text-base-content/60">
                          Choose which workspace's context to include in the MCP URL
                        </span>
                      </label>
                    </div>
                  )}
                  <div className="form-control">
                    <label className="label">
                      <span className="label-text">MCP Server URL</span>
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={mcpUrlData.url}
                        readOnly
                        className="input input-bordered flex-1 font-mono text-xs break-all bg-base-200"
                      />
                      <button
                        onClick={handleCopyMcpUrl}
                        className="btn btn-primary btn-sm whitespace-nowrap"
                      >
                        {mcpUrlCopied ? "Copied!" : "Copy URL"}
                      </button>
                    </div>
                    <label className="label">
                      <span className="label-text-alt text-base-content/60">
                        Use this URL to connect AI agents and tools to your KnowledgePlane MCP server. Your API key and workspace context are included in the URL.
                      </span>
                    </label>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <p className="text-base-content/70">
                    Generate an API key to get your MCP server URL.
                  </p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}

