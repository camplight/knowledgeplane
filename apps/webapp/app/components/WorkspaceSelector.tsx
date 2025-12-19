"use client";

import { trpc } from "../../utils/trpc";
import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";

export function WorkspaceSelector() {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const { data: workspacesData, isLoading } = trpc.workspaces.list.useQuery();
  const { data: userData } = trpc.auth.me.useQuery();
  const [isSwitching, setIsSwitching] = useState(false);

  const switchWorkspace = async (workspaceId: string) => {
    setIsSwitching(true);
    try {
      const response = await fetch("/api/workspaces/switch", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ workspaceId }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to switch workspace");
      }

      setIsOpen(false);
      router.refresh();
      window.location.reload(); // Force reload to update context
    } catch (error: any) {
      console.error("Failed to switch workspace:", error);
      alert(error.message || "Failed to switch workspace");
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

  // Get current workspace from userData
  const currentWorkspaceId = userData?.currentWorkspaceId || null;
  const currentWorkspace = workspacesData?.find((w) => w.id === currentWorkspaceId);

  if (isLoading) {
    return (
      <div className="px-3 py-2 text-sm text-slate-600">Loading workspaces...</div>
    );
  }

  if (!workspacesData || workspacesData.length === 0) {
    return null;
  }

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-slate-700 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors"
      >
        <span className="text-slate-500">Workspace:</span>
        <span className="font-semibold">
          {currentWorkspace?.name || "Select Workspace"}
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
            Switch Workspace
          </div>
          {workspacesData.map((workspace) => (
            <button
              key={workspace.id}
              onClick={() => switchWorkspace(workspace.id)}
              disabled={isSwitching}
              className={`w-full text-left px-3 py-2 text-sm hover:bg-slate-50 transition-colors flex items-center justify-between ${
                workspace.id === currentWorkspaceId ? "bg-indigo-50 text-indigo-700" : ""
              }`}
            >
              <span className="font-medium">{workspace.name}</span>
              {workspace.id === currentWorkspaceId && (
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
              onClick={() => router.push("/workspaces")}
              className="w-full text-left px-3 py-2 text-sm text-indigo-600 hover:bg-slate-50 transition-colors"
            >
              Manage Workspaces →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

