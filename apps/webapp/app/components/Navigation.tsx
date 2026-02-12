"use client";

import { trpc } from "../../utils/trpc";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { useState, useRef, useEffect } from "react";
import { WorkspaceSelector } from "./WorkspaceSelector";

export function Navigation() {
  const router = useRouter();
  const pathname = usePathname();
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const isActive = (path: string) => pathname === path;

  const { data: userData } = trpc.auth.me.useQuery();
  const logoutMutation = trpc.auth.logout.useMutation({
    onSuccess: () => {
      router.push("/");
    },
  });

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  const handleLogout = () => {
    logoutMutation.mutate();
    setIsDropdownOpen(false);
  };

  if (!userData?.user) {
    return null;
  }

  const user = userData.user;

  return (
    <nav className="fixed top-0 left-0 right-0 h-16 border-b border-slate-200 bg-white/80 backdrop-blur-sm z-50">
      <div className="h-full px-6 flex items-center justify-between">
        {/* Left side: Logo, Title, Workspace Selector */}
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-3">
            <img
              src="/logo.png"
              alt="KnowledgePlane Logo"
              className="w-10 h-10 object-contain"
            />
            <span className="text-xl font-bold font-display bg-gradient-to-r from-slate-900 via-blue-900 to-indigo-900 bg-clip-text text-transparent">
              KnowledgePlane
            </span>
          </div>
          <div className="h-8 w-px bg-slate-200" />
          <WorkspaceSelector />
        </div>

        {/* Right side: User Menu */}
        <div className="relative" ref={dropdownRef}>
          <button
            onClick={() => setIsDropdownOpen(!isDropdownOpen)}
            className="flex items-center gap-3 px-3 py-2 text-sm hover:bg-slate-50 rounded-lg transition-colors"
          >
            <div className="flex flex-col items-end">
              <span className="font-display font-medium text-slate-900">{user.username}</span>
              {user.email && (
                <span className="text-xs text-slate-500">{user.email}</span>
              )}
            </div>
            <svg
              className={`w-4 h-4 text-slate-500 transition-transform ${isDropdownOpen ? "rotate-180" : ""}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {isDropdownOpen && (
            <div className="absolute right-0 mt-2 w-48 bg-white rounded-lg shadow-lg border border-slate-200 py-1">
              <Link
                href="/profile"
                onClick={() => setIsDropdownOpen(false)}
                className={`w-full text-left px-4 py-2 text-sm transition-colors block font-display ${
                  isActive("/profile")
                    ? "bg-blue-50 text-blue-700 font-medium"
                    : "text-slate-700 hover:bg-slate-50"
                }`}
              >
                Profile
              </Link>
              <button
                onClick={handleLogout}
                className="w-full text-left px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 transition-colors font-display"
              >
                Logout
              </button>
            </div>
          )}
        </div>
      </div>
    </nav>
  );
}

