"use client";

import { trpc } from "../../utils/trpc";
import { useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import { AppLayout } from "../components/AppLayout";
import {
  WORKSPACE_AI_CHAT_MODELS,
  WORKSPACE_AI_PROVIDERS,
  WORKSPACE_AI_PROVIDER_LABELS,
  getWorkspaceDefaultChatModel,
  type WorkspaceAIProvider,
} from "@knowledgeplane/aimodel";

export default function WorkspacesPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<"workspaces" | "members" | "invitations">("workspaces");
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string | null>(null);
  const [workspaceName, setWorkspaceName] = useState("");
  const [workspaceDescription, setWorkspaceDescription] = useState("");
  const [createAiProvider, setCreateAiProvider] = useState<WorkspaceAIProvider>("openai");
  const [createAiChatModel, setCreateAiChatModel] = useState<string>(
    getWorkspaceDefaultChatModel("openai"),
  );
  const [editAiProvider, setEditAiProvider] = useState<WorkspaceAIProvider>("openai");
  const [editAiChatModel, setEditAiChatModel] = useState<string>(
    getWorkspaceDefaultChatModel("openai"),
  );
  const [isCreatingWorkspace, setIsCreatingWorkspace] = useState(false);
  const [expiresInDays, setExpiresInDays] = useState(7);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const { data: userData, isLoading: userLoading } = trpc.auth.me.useQuery();
  const { data: workspacesData, refetch: refetchWorkspaces } = trpc.workspaces.list.useQuery();
  const { data: workspaceData, refetch: refetchWorkspace } = trpc.workspaces.getById.useQuery(
    { id: selectedWorkspaceId! },
    { enabled: !!selectedWorkspaceId },
  );
  const { data: membersData, refetch: refetchMembers } = trpc.workspaces.listMembers.useQuery(
    { workspace_id: selectedWorkspaceId!, limit: 100, offset: 0 },
    { enabled: !!selectedWorkspaceId },
  );
  const { data: invitationsData, refetch: refetchInvitations } = trpc.workspaces.listInvitations.useQuery(
    { workspace_id: selectedWorkspaceId!, limit: 100, offset: 0 },
    { enabled: !!selectedWorkspaceId },
  );

  const createWorkspaceMutation = trpc.workspaces.create.useMutation({
    onSuccess: () => {
      setWorkspaceName("");
      setWorkspaceDescription("");
      setIsCreatingWorkspace(false);
      refetchWorkspaces();
    },
  });

  const updateWorkspaceMutation = trpc.workspaces.update.useMutation({
    onSuccess: () => {
      refetchWorkspace();
      refetchWorkspaces();
    },
  });

  const deleteWorkspaceMutation = trpc.workspaces.delete.useMutation({
    onSuccess: () => {
      setSelectedWorkspaceId(null);
      refetchWorkspaces();
    },
  });

  const addMemberMutation = trpc.workspaces.addMember.useMutation({
    onSuccess: () => {
      refetchMembers();
    },
  });

  const updateMemberMutation = trpc.workspaces.updateMember.useMutation({
    onSuccess: () => {
      refetchMembers();
    },
  });

  const removeMemberMutation = trpc.workspaces.removeMember.useMutation({
    onSuccess: () => {
      refetchMembers();
    },
  });

  const createInvitationMutation = trpc.workspaces.createInvitation.useMutation({
    onSuccess: () => {
      setExpiresInDays(7);
      refetchInvitations();
    },
  });

  const deleteInvitationMutation = trpc.workspaces.deleteInvitation.useMutation({
    onSuccess: () => {
      refetchInvitations();
      setToastMessage("Invitation deleted successfully");
      setTimeout(() => setToastMessage(null), 3000);
    },
    onError: (error) => {
      setToastMessage(`Failed to delete invitation: ${error.message}`);
      setTimeout(() => setToastMessage(null), 3000);
    },
  });

  useEffect(() => {
    if (!userLoading && !userData?.user) {
      router.push("/");
    }
  }, [userLoading, userData, router]);

  useEffect(() => {
    if (selectedWorkspaceId) {
      refetchWorkspace();
      refetchMembers();
      refetchInvitations();
    }
  }, [selectedWorkspaceId, activeTab]);

  useEffect(() => {
    if (!workspaceData) return;
    const provider = (workspaceData.ai_provider || "openai") as WorkspaceAIProvider;
    setEditAiProvider(provider);
    setEditAiChatModel(workspaceData.ai_chat_model || getWorkspaceDefaultChatModel(provider));
  }, [workspaceData]);

  const handleCreateWorkspace = (e: React.FormEvent) => {
    e.preventDefault();
    createWorkspaceMutation.mutate({
      name: workspaceName.trim(),
      description: workspaceDescription.trim() || undefined,
      ai_provider: createAiProvider,
      ai_chat_model: createAiChatModel,
    });
  };

  const handleUpdateWorkspace = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedWorkspaceId) return;
    updateWorkspaceMutation.mutate({
      id: selectedWorkspaceId,
      name: workspaceName.trim() || undefined,
      description: workspaceDescription.trim() || undefined,
      ai_provider: editAiProvider,
      ai_chat_model: editAiChatModel,
    });
  };

  const handleDeleteWorkspace = () => {
    if (!selectedWorkspaceId) return;
    if (!confirm("Are you sure you want to delete this workspace? This action cannot be undone.")) {
      return;
    }
    deleteWorkspaceMutation.mutate({ id: selectedWorkspaceId });
  };

  const handleCreateInvitation = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedWorkspaceId) return;
    createInvitationMutation.mutate({
      workspace_id: selectedWorkspaceId,
      expires_in_days: expiresInDays,
    });
  };

  const copyInvitationLink = (token: string) => {
    const link = `${window.location.origin}/invite/${token}`;
    navigator.clipboard.writeText(link);
    setToastMessage("Invitation link copied to clipboard!");
    setTimeout(() => setToastMessage(null), 3000);
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

  const selectedWorkspace = workspaceData;
  const currentMember = selectedWorkspaceId
    ? membersData?.members.find((m) => m.user_id === userData.user.userId)
    : null;
  const canManage = currentMember?.role === "owner" || currentMember?.role === "admin";
  return (
    <AppLayout>
      {/* Toast Notification */}
      {toastMessage && (
        <div className="toast toast-top toast-end">
          <div className="alert alert-success">
            <svg
              className="w-5 h-5 shrink-0"
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
              className="btn btn-ghost btn-sm"
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
          <h1 className="text-3xl font-bold">Workspace Management</h1>
          <p className="text-base-content/70 mt-2">Create and manage your workspaces</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Workspaces List */}
          <div className="lg:col-span-1">
            <div className="card bg-base-100 shadow-xl">
              <div className="card-body">
                <div className="flex justify-between items-center mb-4">
                  <h2 className="card-title">Workspaces</h2>
                  <button
                    onClick={() => {
                      setIsCreatingWorkspace(true);
                      setSelectedWorkspaceId(null);
                      setWorkspaceName("");
                      setWorkspaceDescription("");
                      setCreateAiProvider("openai");
                      setCreateAiChatModel(getWorkspaceDefaultChatModel("openai"));
                    }}
                    className="btn btn-primary btn-sm"
                  >
                    + New
                  </button>
                </div>

              {isCreatingWorkspace ? (
                <form onSubmit={handleCreateWorkspace} className="mb-4 p-3 bg-base-200 rounded-lg">
                  <input
                    type="text"
                    value={workspaceName}
                    onChange={(e) => setWorkspaceName(e.target.value)}
                    placeholder="Workspace name"
                    className="input input-bordered w-full mb-2"
                    required
                  />
                  <textarea
                    value={workspaceDescription}
                    onChange={(e) => setWorkspaceDescription(e.target.value)}
                    placeholder="Description (optional)"
                    className="textarea textarea-bordered w-full mb-2"
                    rows={2}
                  />
                  <div className="grid grid-cols-1 gap-2 mb-2">
                    <select
                      className="select select-bordered w-full"
                      value={createAiProvider}
                      onChange={(e) => {
                        const provider = e.target.value as WorkspaceAIProvider;
                        setCreateAiProvider(provider);
                        setCreateAiChatModel(getWorkspaceDefaultChatModel(provider));
                      }}
                    >
                      {WORKSPACE_AI_PROVIDERS.map((p) => (
                        <option key={p} value={p}>
                          {WORKSPACE_AI_PROVIDER_LABELS[p]}
                        </option>
                      ))}
                    </select>
                    <select
                      className="select select-bordered w-full"
                      value={createAiChatModel}
                      onChange={(e) => setCreateAiChatModel(e.target.value)}
                    >
                      {WORKSPACE_AI_CHAT_MODELS[createAiProvider].map((m) => (
                        <option key={m} value={m}>
                          {m}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="submit"
                      disabled={createWorkspaceMutation.isPending}
                      className="btn btn-primary btn-sm flex-1"
                    >
                      Create
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setIsCreatingWorkspace(false);
                        setWorkspaceName("");
                        setWorkspaceDescription("");
                      }}
                      className="btn btn-ghost btn-sm"
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              ) : null}

              <div className="space-y-2">
                {workspacesData?.map((workspace) => (
                  <button
                    key={workspace.id}
                    onClick={() => {
                      setSelectedWorkspaceId(workspace.id);
                      setIsCreatingWorkspace(false);
                    }}
                    className={`btn btn-block justify-start ${
                      selectedWorkspaceId === workspace.id
                        ? "btn-primary"
                        : "btn-ghost"
                    }`}
                  >
                    <div className="text-left w-full">
                      <div className="font-medium">{workspace.name}</div>
                      {workspace.description && (
                        <div className="text-xs opacity-70 mt-1">{workspace.description}</div>
                      )}
                    </div>
                  </button>
                ))}
              </div>
              </div>
            </div>
          </div>

          {/* Workspace Details */}
          <div className="lg:col-span-2">
            {selectedWorkspace ? (
              <div className="card bg-base-100 shadow-xl">
                <div className="card-body">
                  <div className="flex justify-between items-start mb-6">
                    <div>
                      <h2 className="card-title text-2xl">{selectedWorkspace.name}</h2>
                      {selectedWorkspace.description && (
                        <p className="text-base-content/70 mt-1">{selectedWorkspace.description}</p>
                      )}
                    </div>
                    {currentMember?.role === "owner" && (
                      <button
                        onClick={handleDeleteWorkspace}
                        disabled={deleteWorkspaceMutation.isPending}
                        className="btn btn-error btn-sm"
                      >
                        Delete Workspace
                      </button>
                    )}
                  </div>

                {/* Tabs */}
                <div className="tabs tabs-bordered mb-6">
                  <button
                    onClick={() => setActiveTab("workspaces")}
                    className={`tab ${activeTab === "workspaces" ? "tab-active" : ""}`}
                  >
                    Settings
                  </button>
                  <button
                    onClick={() => setActiveTab("members")}
                    className={`tab ${activeTab === "members" ? "tab-active" : ""}`}
                  >
                    Members <span className="badge badge-sm ml-2">{membersData?.total || 0}</span>
                  </button>
                  <button
                    onClick={() => setActiveTab("invitations")}
                    className={`tab ${activeTab === "invitations" ? "tab-active" : ""}`}
                  >
                    Invitations <span className="badge badge-sm ml-2">{invitationsData?.total || 0}</span>
                  </button>
                </div>

                {/* Settings Tab */}
                {activeTab === "workspaces" && canManage && (
                  <form onSubmit={handleUpdateWorkspace} className="space-y-4">
                    <div className="form-control">
                      <label className="label">
                        <span className="label-text">Workspace Name</span>
                      </label>
                      <input
                        type="text"
                        value={workspaceName || selectedWorkspace.name}
                        onChange={(e) => setWorkspaceName(e.target.value)}
                        className="input input-bordered w-full"
                        required
                      />
                    </div>
                    <div className="form-control">
                      <label className="label">
                        <span className="label-text">Description</span>
                      </label>
                      <textarea
                        value={workspaceDescription || selectedWorkspace.description || ""}
                        onChange={(e) => setWorkspaceDescription(e.target.value)}
                        className="textarea textarea-bordered w-full"
                        rows={3}
                      />
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="form-control">
                        <label className="label">
                          <span className="label-text">AI Service</span>
                        </label>
                        <select
                          className="select select-bordered w-full"
                          value={editAiProvider}
                          onChange={(e) => {
                            const provider = e.target.value as WorkspaceAIProvider;
                            setEditAiProvider(provider);
                            setEditAiChatModel(getWorkspaceDefaultChatModel(provider));
                          }}
                        >
                          {WORKSPACE_AI_PROVIDERS.map((p) => (
                            <option key={p} value={p}>
                              {WORKSPACE_AI_PROVIDER_LABELS[p]}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="form-control">
                        <label className="label">
                          <span className="label-text">AI Model</span>
                        </label>
                        <select
                          className="select select-bordered w-full"
                          value={editAiChatModel}
                          onChange={(e) => setEditAiChatModel(e.target.value)}
                        >
                          {WORKSPACE_AI_CHAT_MODELS[editAiProvider].map((m) => (
                            <option key={m} value={m}>
                              {m}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                    <button
                      type="submit"
                      disabled={updateWorkspaceMutation.isPending}
                      className="btn btn-primary"
                    >
                      {updateWorkspaceMutation.isPending ? "Saving..." : "Save Changes"}
                    </button>
                  </form>
                )}

                {/* Members Tab */}
                {activeTab === "members" && (
                  <div className="space-y-4">
                    <div className="space-y-2">
                      {membersData?.members.map((member) => (
                        <div
                          key={member.id}
                          className="card bg-base-200"
                        >
                          <div className="card-body p-4">
                            <div className="flex items-center justify-between">
                              <div>
                                <div className="font-medium">{member.user?.username || "Unknown"}</div>
                                <div className="text-sm opacity-70">{member.user?.email}</div>
                              </div>
                              <div className="flex items-center gap-3">
                                <span className="badge badge-primary">
                                  {member.role}
                                </span>
                                {canManage && member.user_id !== userData.user.userId && (
                                  <select
                                    value={member.role}
                                    onChange={(e) => {
                                      updateMemberMutation.mutate({
                                        workspace_id: selectedWorkspaceId!,
                                        member_id: member.id,
                                        role: e.target.value as "owner" | "admin" | "member",
                                      });
                                    }}
                                    className="select select-bordered select-sm"
                                    disabled={updateMemberMutation.isPending}
                                  >
                                    <option value="member">Member</option>
                                    <option value="admin">Admin</option>
                                    {currentMember?.role === "owner" && (
                                      <option value="owner">Owner</option>
                                    )}
                                  </select>
                                )}
                                {canManage && member.user_id !== userData.user.userId && (
                                  <button
                                    onClick={() => {
                                      if (confirm("Remove this member from the workspace?")) {
                                        removeMemberMutation.mutate({
                                          workspace_id: selectedWorkspaceId!,
                                          member_id: member.id,
                                        });
                                      }
                                    }}
                                    className="btn btn-error btn-sm"
                                  >
                                    Remove
                                  </button>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Invitations Tab */}
                {activeTab === "invitations" && (
                  <div className="space-y-4">
                    {canManage && (
                      <form onSubmit={handleCreateInvitation} className="card bg-base-200">
                        <div className="card-body">
                          <div className="form-control">
                            <label className="label">
                              <span className="label-text">Expiration Days</span>
                            </label>
                            <input
                              type="number"
                              min="1"
                              max="365"
                              value={isNaN(expiresInDays) ? "" : expiresInDays}
                              onChange={(e) => {
                                const value = parseInt(e.target.value, 10);
                                setExpiresInDays(isNaN(value) ? 7 : value);
                              }}
                              className="input input-bordered w-full"
                              placeholder="7"
                            />
                            <label className="label">
                              <span className="label-text-alt">Number of days until the invitation expires (default: 7 days)</span>
                            </label>
                          </div>
                          <button
                            type="submit"
                            disabled={createInvitationMutation.isPending}
                            className="btn btn-primary w-full"
                          >
                            Create Invitation
                          </button>
                        </div>
                      </form>
                    )}

                    <div className="space-y-2">
                      {invitationsData?.invitations.map((inv) => (
                        <div
                          key={inv.id}
                          className="card bg-base-200"
                        >
                          <div className="card-body p-4">
                            <div className="flex items-center justify-between">
                              <div className="flex-1">
                                <div className="font-medium">
                                  Invitation Link
                                </div>
                                <div className="text-sm font-mono opacity-70">
                                  /invite/{inv.token}
                                </div>
                                <div className="text-xs opacity-50 mt-1">
                                  <span className="badge badge-sm badge-outline mr-2">{inv.status}</span>
                                  Expires: {new Date(inv.expires_at).toLocaleDateString()}
                                </div>
                              </div>
                              <div className="flex items-center gap-2">
                                <button
                                  onClick={() => copyInvitationLink(inv.token)}
                                  className="btn btn-primary btn-sm"
                                >
                                  Copy Link
                                </button>
                                {canManage && (
                                  <button
                                    onClick={() => {
                                      if (confirm("Are you sure you want to delete this invitation?")) {
                                        deleteInvitationMutation.mutate({
                                          workspace_id: selectedWorkspaceId!,
                                          invitation_id: inv.id,
                                        });
                                      }
                                    }}
                                    disabled={deleteInvitationMutation.isPending}
                                    className="btn btn-error btn-sm btn-square"
                                    title="Delete invitation"
                                  >
                                    <svg
                                      className="w-5 h-5"
                                      fill="none"
                                      stroke="currentColor"
                                      viewBox="0 0 24 24"
                                    >
                                      <path
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        strokeWidth={2}
                                        d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                                      />
                                    </svg>
                                  </button>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                </div>
              </div>
            ) : (
              <div className="card bg-base-100 shadow-xl">
                <div className="card-body items-center text-center">
                  <p className="opacity-70">Select a workspace to view details</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </AppLayout>
  );
}

