"use client";

import { trpc } from "../../utils/trpc";
import { useRouter } from "next/navigation";
import { useState, useEffect } from "react";

export default function UsersPage() {
  const router = useRouter();
  const [page, setPage] = useState(0);
  const [invitationPage, setInvitationPage] = useState(0);
  const [activeTab, setActiveTab] = useState<"users" | "invitations">("users");
  const [email, setEmail] = useState("");
  const [expiresInDays, setExpiresInDays] = useState(7);
  const limit = 10;

  const { data: userData, isLoading: userLoading } = trpc.auth.me.useQuery();
  const { data: usersData, isLoading: usersLoading } = trpc.user.list.useQuery({
    limit,
    offset: page * limit,
  });
  const {
    data: invitationsData,
    isLoading: invitationsLoading,
    refetch: refetchInvitations,
  } = trpc.invitations.list.useQuery({
    limit,
    offset: invitationPage * limit,
  });

  const createInvitationMutation = trpc.invitations.create.useMutation({
    onSuccess: () => {
      setEmail("");
      setExpiresInDays(7);
      // Refetch invitations
      refetchInvitations();
    },
  });

  const logoutMutation = trpc.auth.logout.useMutation({
    onSuccess: () => {
      router.push("/");
    },
  });

  useEffect(() => {
    if (!userLoading && !userData?.user) {
      router.push("/");
    }
  }, [userLoading, userData, router]);

  const handleLogout = () => {
    logoutMutation.mutate();
  };

  const handleCreateInvitation = (e: React.FormEvent) => {
    e.preventDefault();
    createInvitationMutation.mutate({
      email,
      expires_in_days: expiresInDays,
    });
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

  const user = userData.user;
  const users = usersData?.users || [];
  const totalUsers = usersData?.total || 0;
  const totalUserPages = Math.ceil(totalUsers / limit);

  const invitations = invitationsData?.invitations || [];
  const totalInvitations = invitationsData?.total || 0;
  const totalInvitationPages = Math.ceil(totalInvitations / limit);

  return (
    <div className="min-h-screen bg-white">
      {/* Navigation */}
      <nav className="border-b border-slate-200 bg-white/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gradient-to-br from-blue-600 to-indigo-600 rounded-xl flex items-center justify-center shadow-lg shadow-blue-500/25">
                <svg
                  className="w-5 h-5 text-white"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
                  />
                </svg>
              </div>
              <span className="text-xl font-bold bg-gradient-to-r from-slate-900 via-blue-900 to-indigo-900 bg-clip-text text-transparent">
                KnowledgePlane
              </span>
            </div>
            <div className="flex items-center gap-4">
              <button
                onClick={() => router.push("/dashboard")}
                className="px-4 py-2 text-sm font-medium text-slate-700 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors"
              >
                Dashboard
              </button>
              <button
                onClick={() => router.push("/upload")}
                className="px-4 py-2 text-sm font-medium text-blue-700 hover:text-blue-900 hover:bg-blue-50 rounded-lg transition-colors"
              >
                Upload Files
              </button>
              <button
                onClick={() => router.push("/editor")}
                className="px-4 py-2 text-sm font-medium text-slate-700 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors"
              >
                Editor
              </button>
              <button
                onClick={() => router.push("/chat")}
                className="px-4 py-2 text-sm font-medium text-slate-700 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors"
              >
                Chat
              </button>
              <button
                onClick={() => router.push("/profile")}
                className="px-4 py-2 text-sm font-medium text-slate-700 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors"
              >
                Profile
              </button>
              <div className="text-sm text-slate-600">
                <span className="font-medium">{user.username}</span>
                <span className="text-slate-400 mx-2">•</span>
                <span>{user.email}</span>
              </div>
              <button
                onClick={handleLogout}
                className="px-4 py-2 text-sm font-medium text-slate-700 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors"
              >
                Logout
              </button>
            </div>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main className="container mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-slate-900 mb-2">
            Users & Invitations
          </h1>
          <p className="text-lg text-slate-600">
            Manage users and send invitations to join the system
          </p>
        </div>

        {/* Tabs */}
        <div className="mb-6 border-b border-slate-200">
          <div className="flex gap-4">
            <button
              onClick={() => setActiveTab("users")}
              className={`px-4 py-2 font-medium transition-colors ${
                activeTab === "users"
                  ? "text-blue-600 border-b-2 border-blue-600"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              Users ({totalUsers})
            </button>
            <button
              onClick={() => setActiveTab("invitations")}
              className={`px-4 py-2 font-medium transition-colors ${
                activeTab === "invitations"
                  ? "text-blue-600 border-b-2 border-blue-600"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              Invitations ({totalInvitations})
            </button>
          </div>
        </div>

        {activeTab === "users" ? (
          <>
            {/* Users List */}
            <div className="bg-white rounded-xl shadow-lg border border-slate-200">
              <div className="p-6 border-b border-slate-200">
                <h2 className="text-2xl font-bold text-slate-900">All Users</h2>
                <p className="text-sm text-slate-600 mt-1">
                  View all users in the system
                </p>
              </div>

              {usersLoading ? (
                <div className="p-8 text-center">
                  <div className="text-slate-600">Loading users...</div>
                </div>
              ) : users.length === 0 ? (
                <div className="p-8 text-center">
                  <svg
                    className="w-16 h-16 text-slate-300 mx-auto mb-4"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"
                    />
                  </svg>
                  <p className="text-lg font-medium text-slate-900 mb-2">
                    No users yet
                  </p>
                  <p className="text-slate-600">
                    Invite users to join the system
                  </p>
                </div>
              ) : (
                <>
                  <div className="divide-y divide-slate-200">
                    {users.map((u) => (
                      <div
                        key={u.id}
                        className="p-6 hover:bg-slate-50 transition-colors"
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1">
                            <div className="flex items-center gap-3 mb-2">
                              <h3 className="text-lg font-semibold text-slate-900">
                                {u.username}
                              </h3>
                              {u.invitationStatus === "pending" && (
                                <span className="inline-flex items-center gap-1 px-2 py-1 bg-yellow-50 text-yellow-700 rounded-md text-xs font-medium">
                                  <svg
                                    className="w-3 h-3"
                                    fill="none"
                                    stroke="currentColor"
                                    viewBox="0 0 24 24"
                                  >
                                    <path
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                      strokeWidth={2}
                                      d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                                    />
                                  </svg>
                                  Invited
                                </span>
                              )}
                              {u.invitationStatus === "accepted" && (
                                <span className="inline-flex items-center gap-1 px-2 py-1 bg-green-50 text-green-700 rounded-md text-xs font-medium">
                                  <svg
                                    className="w-3 h-3"
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
                                  Accepted
                                </span>
                              )}
                            </div>
                            <p className="text-slate-600 mb-2">{u.email}</p>
                            <div className="flex items-center gap-4 text-sm text-slate-500">
                              <span className="flex items-center gap-1">
                                <svg
                                  className="w-4 h-4"
                                  fill="none"
                                  stroke="currentColor"
                                  viewBox="0 0 24 24"
                                >
                                  <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={2}
                                    d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                                  />
                                </svg>
                                Joined {new Date(u.created_at).toLocaleDateString()}
                              </span>
                              {u.api_key && (
                                <span className="inline-flex items-center gap-1 px-2 py-1 bg-blue-50 text-blue-700 rounded-md text-xs">
                                  API Key
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Pagination */}
                  {totalUserPages > 1 && (
                    <div className="p-6 border-t border-slate-200 flex items-center justify-between">
                      <div className="text-sm text-slate-600">
                        Showing {page * limit + 1} to{" "}
                        {Math.min((page + 1) * limit, totalUsers)} of {totalUsers}{" "}
                        users
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => setPage(Math.max(0, page - 1))}
                          disabled={page === 0}
                          className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                          Previous
                        </button>
                        <button
                          onClick={() =>
                            setPage(Math.min(totalUserPages - 1, page + 1))
                          }
                          disabled={page >= totalUserPages - 1}
                          className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                          Next
                        </button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </>
        ) : (
          <>
            {/* Create Invitation Form */}
            <div className="bg-white rounded-xl shadow-lg border border-slate-200 mb-6">
              <div className="p-6 border-b border-slate-200">
                <h2 className="text-2xl font-bold text-slate-900">
                  Send Invitation
                </h2>
                <p className="text-sm text-slate-600 mt-1">
                  Invite a new user to join the system
                </p>
              </div>
              <form onSubmit={handleCreateInvitation} className="p-6">
                <div className="space-y-4">
                  <div>
                    <label
                      htmlFor="email"
                      className="block text-sm font-medium text-slate-700 mb-2"
                    >
                      Email Address
                    </label>
                    <input
                      type="email"
                      id="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      placeholder="user@example.com"
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="expiresInDays"
                      className="block text-sm font-medium text-slate-700 mb-2"
                    >
                      Expires In (days)
                    </label>
                    <input
                      type="number"
                      id="expiresInDays"
                      value={expiresInDays}
                      onChange={(e) =>
                        setExpiresInDays(parseInt(e.target.value) || 7)
                      }
                      min={1}
                      max={365}
                      className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                  {createInvitationMutation.error && (
                    <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                      {createInvitationMutation.error.message}
                    </div>
                  )}
                  {createInvitationMutation.isSuccess && (
                    <div className="p-3 bg-green-50 border border-green-200 rounded-lg text-green-700 text-sm">
                      Invitation sent successfully!
                    </div>
                  )}
                  <button
                    type="submit"
                    disabled={createInvitationMutation.isPending}
                    className="w-full px-4 py-2 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {createInvitationMutation.isPending
                      ? "Sending..."
                      : "Send Invitation"}
                  </button>
                </div>
              </form>
            </div>

            {/* Invitations List */}
            <div className="bg-white rounded-xl shadow-lg border border-slate-200">
              <div className="p-6 border-b border-slate-200">
                <h2 className="text-2xl font-bold text-slate-900">
                  Invitations
                </h2>
                <p className="text-sm text-slate-600 mt-1">
                  View all invitations sent to users
                </p>
              </div>

              {invitationsLoading ? (
                <div className="p-8 text-center">
                  <div className="text-slate-600">Loading invitations...</div>
                </div>
              ) : invitations.length === 0 ? (
                <div className="p-8 text-center">
                  <svg
                    className="w-16 h-16 text-slate-300 mx-auto mb-4"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                    />
                  </svg>
                  <p className="text-lg font-medium text-slate-900 mb-2">
                    No invitations yet
                  </p>
                  <p className="text-slate-600">
                    Send an invitation to get started
                  </p>
                </div>
              ) : (
                <>
                  <div className="divide-y divide-slate-200">
                    {invitations.map((inv) => {
                      const expiresAt = new Date(inv.expires_at);
                      const isExpired = expiresAt < new Date();
                      const status =
                        inv.status === "accepted"
                          ? "accepted"
                          : isExpired || inv.status === "expired"
                            ? "expired"
                            : "pending";

                      return (
                        <div
                          key={inv.id}
                          className="p-6 hover:bg-slate-50 transition-colors"
                        >
                          <div className="flex items-start justify-between gap-4">
                            <div className="flex-1">
                              <div className="flex items-center gap-3 mb-2">
                                <h3 className="text-lg font-semibold text-slate-900">
                                  {inv.email}
                                </h3>
                                {status === "pending" && (
                                  <span className="inline-flex items-center gap-1 px-2 py-1 bg-yellow-50 text-yellow-700 rounded-md text-xs font-medium">
                                    Pending
                                  </span>
                                )}
                                {status === "accepted" && (
                                  <span className="inline-flex items-center gap-1 px-2 py-1 bg-green-50 text-green-700 rounded-md text-xs font-medium">
                                    Accepted
                                  </span>
                                )}
                                {status === "expired" && (
                                  <span className="inline-flex items-center gap-1 px-2 py-1 bg-red-50 text-red-700 rounded-md text-xs font-medium">
                                    Expired
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center gap-4 text-sm text-slate-500 mb-2">
                                {inv.inviter && (
                                  <span>
                                    Invited by{" "}
                                    <span className="font-medium">
                                      {inv.inviter.username}
                                    </span>
                                  </span>
                                )}
                                <span className="flex items-center gap-1">
                                  <svg
                                    className="w-4 h-4"
                                    fill="none"
                                    stroke="currentColor"
                                    viewBox="0 0 24 24"
                                  >
                                    <path
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                      strokeWidth={2}
                                      d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                                    />
                                  </svg>
                                  Sent {new Date(inv.created_at).toLocaleDateString()}
                                </span>
                                {status === "pending" && (
                                  <span>
                                    Expires {expiresAt.toLocaleDateString()}
                                  </span>
                                )}
                                {status === "accepted" && inv.accepted_at && (
                                  <span>
                                    Accepted{" "}
                                    {new Date(inv.accepted_at).toLocaleDateString()}
                                  </span>
                                )}
                              </div>
                              {status === "pending" && (
                                <div className="mt-2">
                                  <code className="text-xs bg-slate-100 px-2 py-1 rounded font-mono text-slate-700">
                                    {inv.token}
                                  </code>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Pagination */}
                  {totalInvitationPages > 1 && (
                    <div className="p-6 border-t border-slate-200 flex items-center justify-between">
                      <div className="text-sm text-slate-600">
                        Showing {invitationPage * limit + 1} to{" "}
                        {Math.min(
                          (invitationPage + 1) * limit,
                          totalInvitations,
                        )}{" "}
                        of {totalInvitations} invitations
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() =>
                            setInvitationPage(Math.max(0, invitationPage - 1))
                          }
                          disabled={invitationPage === 0}
                          className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                          Previous
                        </button>
                        <button
                          onClick={() =>
                            setInvitationPage(
                              Math.min(
                                totalInvitationPages - 1,
                                invitationPage + 1,
                              ),
                            )
                          }
                          disabled={invitationPage >= totalInvitationPages - 1}
                          className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                          Next
                        </button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </>
        )}
      </main>
    </div>
  );
}

