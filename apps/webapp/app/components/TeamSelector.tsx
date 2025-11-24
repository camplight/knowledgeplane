"use client";

import { trpc } from "../../utils/trpc";
import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";

export function TeamSelector() {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const { data: teamsData, isLoading } = trpc.teams.list.useQuery();
  const { data: userData } = trpc.auth.me.useQuery();
  const [isSwitching, setIsSwitching] = useState(false);

  const switchTeam = async (teamId: string) => {
    setIsSwitching(true);
    try {
      const response = await fetch("/api/teams/switch", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ teamId }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to switch team");
      }

      setIsOpen(false);
      router.refresh();
      window.location.reload(); // Force reload to update context
    } catch (error: any) {
      console.error("Failed to switch team:", error);
      alert(error.message || "Failed to switch team");
    } finally {
      setIsSwitching(false);
    }
  };

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  // Get current team from userData
  const currentTeamId = userData?.currentTeamId || null;
  const currentTeam = teamsData?.find((t) => t.id === currentTeamId);

  if (isLoading) {
    return (
      <div className="px-3 py-2 text-sm text-slate-600">Loading teams...</div>
    );
  }

  if (!teamsData || teamsData.length === 0) {
    return null;
  }

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-slate-700 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors"
      >
        <span className="text-slate-500">Team:</span>
        <span className="font-semibold">
          {currentTeam?.name || "Select Team"}
        </span>
        <svg
          className={`w-4 h-4 transition-transform ${isOpen ? "rotate-180" : ""}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M19 9l-7 7-7-7"
          />
        </svg>
      </button>

      {isOpen && (
        <div className="absolute top-full left-0 mt-1 w-64 bg-white rounded-lg shadow-lg border border-slate-200 py-1 z-50">
          <div className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase border-b border-slate-100">
            Switch Team
          </div>
          {teamsData.map((team) => (
            <button
              key={team.id}
              onClick={() => switchTeam(team.id)}
              disabled={isSwitching}
              className={`w-full text-left px-3 py-2 text-sm hover:bg-slate-50 transition-colors flex items-center justify-between ${
                team.id === currentTeamId ? "bg-indigo-50 text-indigo-700" : ""
              }`}
            >
              <span className="font-medium">{team.name}</span>
              {team.id === currentTeamId && (
                <svg
                  className="w-4 h-4 text-indigo-600"
                  fill="currentColor"
                  viewBox="0 0 20 20"
                >
                  <path
                    fillRule="evenodd"
                    d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                    clipRule="evenodd"
                  />
                </svg>
              )}
            </button>
          ))}
          <div className="border-t border-slate-100 mt-1 pt-1">
            <button
              onClick={() => router.push("/teams")}
              className="w-full text-left px-3 py-2 text-sm text-indigo-600 hover:bg-slate-50 transition-colors"
            >
              Manage Teams →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

