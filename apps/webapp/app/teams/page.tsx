"use client";

import { trpc } from "../../utils/trpc";
import { useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import { Navigation } from "../components/Navigation";

export default function TeamsPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<"teams" | "members" | "invitations">("teams");
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null);
  const [teamName, setTeamName] = useState("");
  const [teamDescription, setTeamDescription] = useState("");
  const [isCreatingTeam, setIsCreatingTeam] = useState(false);
  const [expiresInDays, setExpiresInDays] = useState(7);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const { data: userData, isLoading: userLoading } = trpc.auth.me.useQuery();
  const { data: teamsData, refetch: refetchTeams } = trpc.teams.list.useQuery();
  const { data: teamData, refetch: refetchTeam } = trpc.teams.getById.useQuery(
    { id: selectedTeamId! },
    { enabled: !!selectedTeamId },
  );
  const { data: membersData, refetch: refetchMembers } = trpc.teams.listMembers.useQuery(
    { team_id: selectedTeamId!, limit: 100, offset: 0 },
    { enabled: !!selectedTeamId },
  );
  const { data: invitationsData, refetch: refetchInvitations } = trpc.teams.listInvitations.useQuery(
    { team_id: selectedTeamId!, limit: 100, offset: 0 },
    { enabled: !!selectedTeamId },
  );

  const createTeamMutation = trpc.teams.create.useMutation({
    onSuccess: () => {
      setTeamName("");
      setTeamDescription("");
      setIsCreatingTeam(false);
      refetchTeams();
    },
  });

  const updateTeamMutation = trpc.teams.update.useMutation({
    onSuccess: () => {
      refetchTeam();
      refetchTeams();
    },
  });

  const deleteTeamMutation = trpc.teams.delete.useMutation({
    onSuccess: () => {
      setSelectedTeamId(null);
      refetchTeams();
    },
  });

  const addMemberMutation = trpc.teams.addMember.useMutation({
    onSuccess: () => {
      refetchMembers();
    },
  });

  const updateMemberMutation = trpc.teams.updateMember.useMutation({
    onSuccess: () => {
      refetchMembers();
    },
  });

  const removeMemberMutation = trpc.teams.removeMember.useMutation({
    onSuccess: () => {
      refetchMembers();
    },
  });

  const createInvitationMutation = trpc.teams.createInvitation.useMutation({
    onSuccess: () => {
      setExpiresInDays(7);
      refetchInvitations();
    },
  });

  const deleteInvitationMutation = trpc.teams.deleteInvitation.useMutation({
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
    if (selectedTeamId) {
      refetchTeam();
      refetchMembers();
      refetchInvitations();
    }
  }, [selectedTeamId, activeTab]);

  const handleCreateTeam = (e: React.FormEvent) => {
    e.preventDefault();
    createTeamMutation.mutate({
      name: teamName.trim(),
      description: teamDescription.trim() || undefined,
    });
  };

  const handleUpdateTeam = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTeamId) return;
    updateTeamMutation.mutate({
      id: selectedTeamId,
      name: teamName.trim() || undefined,
      description: teamDescription.trim() || undefined,
    });
  };

  const handleDeleteTeam = () => {
    if (!selectedTeamId) return;
    if (!confirm("Are you sure you want to delete this team? This action cannot be undone.")) {
      return;
    }
    deleteTeamMutation.mutate({ id: selectedTeamId });
  };

  const handleCreateInvitation = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTeamId) return;
    createInvitationMutation.mutate({
      team_id: selectedTeamId,
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
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-xl text-slate-600">Loading...</div>
      </div>
    );
  }

  if (!userData?.user) {
    return null;
  }

  const selectedTeam = teamData;
  const currentMember = selectedTeamId
    ? membersData?.members.find((m) => m.user_id === userData.user.userId)
    : null;
  const canManage = currentMember?.role === "owner" || currentMember?.role === "admin";

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
          <h1 className="text-3xl font-bold text-slate-900">Team Management</h1>
          <p className="text-slate-600 mt-2">Create and manage your teams</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Teams List */}
          <div className="lg:col-span-1">
            <div className="bg-white border border-slate-200 rounded-lg p-4">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-lg font-semibold text-slate-900">Teams</h2>
                <button
                  onClick={() => {
                    setIsCreatingTeam(true);
                    setSelectedTeamId(null);
                    setTeamName("");
                    setTeamDescription("");
                  }}
                  className="px-3 py-1 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
                >
                  + New
                </button>
              </div>

              {isCreatingTeam ? (
                <form onSubmit={handleCreateTeam} className="mb-4 p-3 bg-slate-50 rounded-lg">
                  <input
                    type="text"
                    value={teamName}
                    onChange={(e) => setTeamName(e.target.value)}
                    placeholder="Team name"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg mb-2"
                    required
                  />
                  <textarea
                    value={teamDescription}
                    onChange={(e) => setTeamDescription(e.target.value)}
                    placeholder="Description (optional)"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg mb-2 text-sm"
                    rows={2}
                  />
                  <div className="flex gap-2">
                    <button
                      type="submit"
                      disabled={createTeamMutation.isPending}
                      className="flex-1 px-3 py-1 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50"
                    >
                      Create
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setIsCreatingTeam(false);
                        setTeamName("");
                        setTeamDescription("");
                      }}
                      className="px-3 py-1 text-sm bg-slate-200 text-slate-700 rounded-lg hover:bg-slate-300"
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              ) : null}

              <div className="space-y-2">
                {teamsData?.map((team) => (
                  <button
                    key={team.id}
                    onClick={() => {
                      setSelectedTeamId(team.id);
                      setIsCreatingTeam(false);
                    }}
                    className={`w-full text-left px-3 py-2 rounded-lg transition-colors ${
                      selectedTeamId === team.id
                        ? "bg-indigo-100 text-indigo-900 font-medium"
                        : "hover:bg-slate-50"
                    }`}
                  >
                    <div className="font-medium">{team.name}</div>
                    {team.description && (
                      <div className="text-xs text-slate-500 mt-1">{team.description}</div>
                    )}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Team Details */}
          <div className="lg:col-span-2">
            {selectedTeam ? (
              <div className="bg-white border border-slate-200 rounded-lg p-6">
                <div className="flex justify-between items-start mb-6">
                  <div>
                    <h2 className="text-2xl font-bold text-slate-900">{selectedTeam.name}</h2>
                    {selectedTeam.description && (
                      <p className="text-slate-600 mt-1">{selectedTeam.description}</p>
                    )}
                  </div>
                  {currentMember?.role === "owner" && (
                    <button
                      onClick={handleDeleteTeam}
                      disabled={deleteTeamMutation.isPending}
                      className="px-4 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
                    >
                      Delete Team
                    </button>
                  )}
                </div>

                {/* Tabs */}
                <div className="border-b border-slate-200 mb-6">
                  <div className="flex gap-4">
                    <button
                      onClick={() => setActiveTab("teams")}
                      className={`pb-3 px-1 font-medium transition-colors ${
                        activeTab === "teams"
                          ? "text-indigo-600 border-b-2 border-indigo-600"
                          : "text-slate-600 hover:text-slate-900"
                      }`}
                    >
                      Settings
                    </button>
                    <button
                      onClick={() => setActiveTab("members")}
                      className={`pb-3 px-1 font-medium transition-colors ${
                        activeTab === "members"
                          ? "text-indigo-600 border-b-2 border-indigo-600"
                          : "text-slate-600 hover:text-slate-900"
                      }`}
                    >
                      Members ({membersData?.total || 0})
                    </button>
                    <button
                      onClick={() => setActiveTab("invitations")}
                      className={`pb-3 px-1 font-medium transition-colors ${
                        activeTab === "invitations"
                          ? "text-indigo-600 border-b-2 border-indigo-600"
                          : "text-slate-600 hover:text-slate-900"
                      }`}
                    >
                      Invitations ({invitationsData?.total || 0})
                    </button>
                  </div>
                </div>

                {/* Settings Tab */}
                {activeTab === "teams" && canManage && (
                  <form onSubmit={handleUpdateTeam} className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-2">
                        Team Name
                      </label>
                      <input
                        type="text"
                        value={teamName || selectedTeam.name}
                        onChange={(e) => setTeamName(e.target.value)}
                        className="w-full px-4 py-2 border border-slate-300 rounded-lg"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-2">
                        Description
                      </label>
                      <textarea
                        value={teamDescription || selectedTeam.description || ""}
                        onChange={(e) => setTeamDescription(e.target.value)}
                        className="w-full px-4 py-2 border border-slate-300 rounded-lg"
                        rows={3}
                      />
                    </div>
                    <button
                      type="submit"
                      disabled={updateTeamMutation.isPending}
                      className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50"
                    >
                      {updateTeamMutation.isPending ? "Saving..." : "Save Changes"}
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
                          className="flex items-center justify-between p-3 bg-slate-50 rounded-lg"
                        >
                          <div>
                            <div className="font-medium">{member.user?.username || "Unknown"}</div>
                            <div className="text-sm text-slate-500">{member.user?.email}</div>
                          </div>
                          <div className="flex items-center gap-3">
                            <span className="px-2 py-1 text-xs font-medium bg-indigo-100 text-indigo-700 rounded">
                              {member.role}
                            </span>
                            {canManage && member.user_id !== userData.user.userId && (
                              <select
                                value={member.role}
                                onChange={(e) => {
                                  updateMemberMutation.mutate({
                                    team_id: selectedTeamId!,
                                    member_id: member.id,
                                    role: e.target.value as "owner" | "admin" | "member",
                                  });
                                }}
                                className="text-sm border border-slate-300 rounded px-2 py-1"
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
                                  if (confirm("Remove this member from the team?")) {
                                    removeMemberMutation.mutate({
                                      team_id: selectedTeamId!,
                                      member_id: member.id,
                                    });
                                  }
                                }}
                                className="px-3 py-1 text-sm text-red-600 hover:bg-red-50 rounded"
                              >
                                Remove
                              </button>
                            )}
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
                      <form onSubmit={handleCreateInvitation} className="p-4 bg-slate-50 rounded-lg">
                        <div className="mb-3">
                          <label className="block text-sm font-medium text-slate-700 mb-1">
                            Expiration Days
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
                            className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                            placeholder="7"
                          />
                          <p className="mt-1 text-xs text-slate-500">
                            Number of days until the invitation expires (default: 7 days)
                          </p>
                        </div>
                        <button
                          type="submit"
                          disabled={createInvitationMutation.isPending}
                          className="w-full px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50"
                        >
                          Create Invitation
                        </button>
                      </form>
                    )}

                    <div className="space-y-2">
                      {invitationsData?.invitations.map((inv) => (
                        <div
                          key={inv.id}
                          className="flex items-center justify-between p-3 bg-slate-50 rounded-lg"
                        >
                          <div className="flex-1">
                            <div className="font-medium">
                              Invitation Link
                            </div>
                            <div className="text-sm text-slate-500 font-mono">
                              /invite/{inv.token}
                            </div>
                            <div className="text-xs text-slate-400 mt-1">
                              Status: {inv.status} • Expires: {new Date(inv.expires_at).toLocaleDateString()}
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => copyInvitationLink(inv.token)}
                              className="px-3 py-1 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
                            >
                              Copy Link
                            </button>
                            {canManage && (
                              <button
                                onClick={() => {
                                  if (confirm("Are you sure you want to delete this invitation?")) {
                                    deleteInvitationMutation.mutate({
                                      team_id: selectedTeamId!,
                                      invitation_id: inv.id,
                                    });
                                  }
                                }}
                                disabled={deleteInvitationMutation.isPending}
                                className="px-3 py-1 text-sm text-red-600 hover:bg-red-50 rounded-lg disabled:opacity-50"
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
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="bg-white border border-slate-200 rounded-lg p-12 text-center">
                <p className="text-slate-500">Select a team to view details</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

