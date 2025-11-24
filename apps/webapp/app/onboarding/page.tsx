"use client";

import { trpc } from "../../utils/trpc";
import { useRouter } from "next/navigation";
import { useState, useEffect } from "react";

export default function OnboardingPage() {
  const router = useRouter();
  const [teamName, setTeamName] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { data: userData, isLoading: userLoading } = trpc.auth.me.useQuery();
  const { data: teamsData } = trpc.teams.list.useQuery();
  const completeOnboardingMutation = trpc.user.completeOnboarding.useMutation({
    onSuccess: () => {
      router.push("/dashboard");
    },
  });
  const createTeamMutation = trpc.teams.create.useMutation({
    onSuccess: async () => {
      // Complete onboarding after team is created
      completeOnboardingMutation.mutate();
    },
  });

  useEffect(() => {
    if (!userLoading && !userData?.user) {
      router.push("/");
    }
  }, [userLoading, userData, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!teamName.trim()) {
      return;
    }

    setIsSubmitting(true);
    try {
      // If user already has teams, just complete onboarding
      if (teamsData && teamsData.length > 0) {
        completeOnboardingMutation.mutate();
      } else {
        // Create a team with the provided name
        createTeamMutation.mutate({
          name: teamName.trim(),
          description: "My team",
        });
      }
    } catch (error) {
      console.error("Onboarding error:", error);
      setIsSubmitting(false);
    }
  };

  if (userLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100">
        <div className="text-xl text-slate-600">Loading...</div>
      </div>
    );
  }

  if (!userData?.user) {
    return null;
  }

  const user = userData.user;
  const hasTeams = teamsData && teamsData.length > 0;

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white rounded-lg shadow-xl p-8">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-slate-900 mb-2">
            Welcome to KnowledgePlane!
          </h1>
          <p className="text-slate-600">
            Let's get you started with your knowledge base.
          </p>
        </div>

        {hasTeams ? (
          <div className="space-y-4">
            <p className="text-slate-700 text-center">
              You already have teams set up. Click below to continue.
            </p>
            <button
              onClick={() => completeOnboardingMutation.mutate()}
              disabled={isSubmitting || completeOnboardingMutation.isPending}
              className="w-full bg-indigo-600 text-white py-3 px-4 rounded-lg font-medium hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting || completeOnboardingMutation.isPending
                ? "Completing..."
                : "Continue to Dashboard"}
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label
                htmlFor="teamName"
                className="block text-sm font-medium text-slate-700 mb-2"
              >
                Create your first team
              </label>
              <input
                id="teamName"
                type="text"
                value={teamName}
                onChange={(e) => setTeamName(e.target.value)}
                placeholder="e.g., My Team, Engineering Team"
                className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                required
                maxLength={100}
                disabled={isSubmitting}
              />
              <p className="mt-2 text-sm text-slate-500">
                Teams help organize your knowledge base. You can create more
                teams later.
              </p>
            </div>

            <button
              type="submit"
              disabled={isSubmitting || !teamName.trim()}
              className="w-full bg-indigo-600 text-white py-3 px-4 rounded-lg font-medium hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting ? "Creating..." : "Create Team & Continue"}
            </button>
          </form>
        )}

        {(createTeamMutation.error || completeOnboardingMutation.error) && (
          <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-sm text-red-600">
              {createTeamMutation.error?.message ||
                completeOnboardingMutation.error?.message ||
                "An error occurred. Please try again."}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

