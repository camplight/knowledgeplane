"use client";

import { trpc } from "../../../utils/trpc";
import { useRouter, useParams } from "next/navigation";
import { useState, useEffect } from "react";
import Link from "next/link";

export default function InviteAcceptPage() {
  const router = useRouter();
  const params = useParams();
  const token = params.token as string;
  const [isAccepting, setIsAccepting] = useState(false);

  const { data: userData, isLoading: userLoading } = trpc.auth.me.useQuery();
  const { data: invitationData, isLoading: invitationLoading } =
    trpc.teams.getInvitationByToken.useQuery(
      { token },
      { enabled: !!token, retry: false },
    );
  const acceptInvitationMutation = trpc.teams.acceptInvitation.useMutation({
    onSuccess: () => {
      router.push("/dashboard");
    },
  });

  // Don't redirect - show welcome page instead

  const handleAccept = async () => {
    if (!token) return;
    setIsAccepting(true);
    try {
      acceptInvitationMutation.mutate({ token });
    } catch (error) {
      console.error("Failed to accept invitation:", error);
      setIsAccepting(false);
    }
  };

  if (invitationLoading || userLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100">
        <div className="text-xl text-slate-600">Loading...</div>
      </div>
    );
  }

  // Show welcome page for unauthenticated users
  if (!userData?.user && invitationData) {
    const invitation = invitationData;
    const expiresAt = new Date(invitation.expires_at);
    const isExpired = expiresAt < new Date() || invitation.status === "expired";

    if (isExpired) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
          <div className="max-w-md w-full bg-white rounded-lg shadow-xl p-8 text-center">
            <div className="mb-6">
              <svg
                className="w-16 h-16 text-yellow-500 mx-auto"
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
            </div>
            <h1 className="text-2xl font-bold text-slate-900 mb-2">
              Invitation Expired
            </h1>
            <p className="text-slate-600 mb-6">
              This invitation link has expired. Please request a new invitation.
            </p>
            <Link
              href="/"
              className="inline-block px-6 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
            >
              Go to Home
            </Link>
          </div>
        </div>
      );
    }


    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
        <div className="max-w-md w-full bg-white rounded-lg shadow-xl p-8">
          <div className="text-center mb-8">
            <div className="w-16 h-16 bg-indigo-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg
                className="w-8 h-8 text-indigo-600"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z"
                />
              </svg>
            </div>
            <h1 className="text-3xl font-bold text-slate-900 mb-2">
              You've Been Invited!
            </h1>
            <p className="text-slate-600">
              You've been invited to join a team on KnowledgePlane
            </p>
          </div>

          <div className="space-y-4 mb-6">
            {invitation.team && (
              <div className="p-4 bg-slate-50 rounded-lg">
                <div className="text-sm text-slate-500 mb-1">Team</div>
                <div className="font-semibold text-slate-900">
                  {invitation.team.name}
                </div>
              </div>
            )}
            {invitation.inviter && (
              <div className="p-4 bg-slate-50 rounded-lg">
                <div className="text-sm text-slate-500 mb-1">Invited by</div>
                <div className="font-semibold text-slate-900">
                  {invitation.inviter.username}
                </div>
              </div>
            )}
            <div className="p-4 bg-slate-50 rounded-lg">
              <div className="text-sm text-slate-500 mb-1">Expires</div>
              <div className="font-semibold text-slate-900">
                {expiresAt.toLocaleDateString()}
              </div>
            </div>
          </div>

          <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-4 mb-6">
            <p className="text-sm text-indigo-800">
              <strong>What happens next?</strong>
            </p>
            <p className="text-sm text-indigo-700 mt-2">
              Sign in to your account to accept this invitation and join the team. 
              If you don't have an account yet, you can create one during sign in.
            </p>
          </div>

          <div className="space-y-3">
            <Link
              href={`/?redirect=/invite/${token}`}
              className="block w-full text-center bg-indigo-600 text-white py-3 px-4 rounded-lg font-medium hover:bg-indigo-700 transition-colors"
            >
              Sign In to Continue
            </Link>
            <Link
              href="/"
              className="block w-full text-center py-3 px-4 text-slate-700 hover:text-slate-900 transition-colors"
            >
              Go to Home
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (!invitationData) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
        <div className="max-w-md w-full bg-white rounded-lg shadow-xl p-8 text-center">
          <div className="mb-6">
            <svg
              className="w-16 h-16 text-red-500 mx-auto"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-slate-900 mb-2">
            Invitation Not Found
          </h1>
          <p className="text-slate-600 mb-6">
            This invitation link is invalid or has expired.
          </p>
          <Link
            href="/"
            className="inline-block px-6 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
          >
            Go to Home
          </Link>
        </div>
      </div>
    );
  }

  const invitation = invitationData;
  const expiresAt = new Date(invitation.expires_at);
  const isExpired = expiresAt < new Date() || invitation.status === "expired";

  if (isExpired) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
        <div className="max-w-md w-full bg-white rounded-lg shadow-xl p-8 text-center">
          <div className="mb-6">
            <svg
              className="w-16 h-16 text-yellow-500 mx-auto"
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
          </div>
          <h1 className="text-2xl font-bold text-slate-900 mb-2">
            Invitation Expired
          </h1>
          <p className="text-slate-600 mb-6">
            This invitation link has expired. Please request a new invitation.
          </p>
          <Link
            href="/"
            className="inline-block px-6 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
          >
            Go to Home
          </Link>
        </div>
      </div>
    );
  }


  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
      <div className="max-w-md w-full bg-white rounded-lg shadow-xl p-8">
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-indigo-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg
              className="w-8 h-8 text-indigo-600"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z"
              />
            </svg>
          </div>
          <h1 className="text-3xl font-bold text-slate-900 mb-2">
            Team Invitation
          </h1>
          <p className="text-slate-600">
            You've been invited to join a team
          </p>
        </div>

        <div className="space-y-4 mb-6">
          {invitation.team && (
            <div className="p-4 bg-slate-50 rounded-lg">
              <div className="text-sm text-slate-500 mb-1">Team</div>
              <div className="font-semibold text-slate-900">
                {invitation.team.name}
              </div>
            </div>
          )}
          {invitation.inviter && (
            <div className="p-4 bg-slate-50 rounded-lg">
              <div className="text-sm text-slate-500 mb-1">Invited by</div>
              <div className="font-semibold text-slate-900">
                {invitation.inviter.username}
              </div>
            </div>
          )}
          <div className="p-4 bg-slate-50 rounded-lg">
            <div className="text-sm text-slate-500 mb-1">Expires</div>
            <div className="font-semibold text-slate-900">
              {expiresAt.toLocaleDateString()}
            </div>
          </div>
        </div>

        {acceptInvitationMutation.error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-sm text-red-600">
              {acceptInvitationMutation.error.message ||
                "Failed to accept invitation. Please try again."}
            </p>
          </div>
        )}

        <div className="space-y-3">
          <button
            onClick={handleAccept}
            disabled={isAccepting || acceptInvitationMutation.isPending}
            className="w-full bg-indigo-600 text-white py-3 px-4 rounded-lg font-medium hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isAccepting || acceptInvitationMutation.isPending
              ? "Accepting..."
              : "Accept Invitation"}
          </button>
          <Link
            href="/dashboard"
            className="block w-full text-center py-3 px-4 text-slate-700 hover:text-slate-900 transition-colors"
          >
            Cancel
          </Link>
        </div>
      </div>
    </div>
  );
}

