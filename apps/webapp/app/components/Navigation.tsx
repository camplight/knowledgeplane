"use client";

import { trpc } from "../../utils/trpc";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { useState, useRef, useEffect } from "react";
import { TeamSelector } from "./TeamSelector";

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
    <nav className="border-b border-slate-200 bg-white/80 backdrop-blur-sm sticky top-0 z-50">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-4">
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-blue-600 to-indigo-600 rounded-xl flex items-center justify-center shadow-lg shadow-blue-500/25">
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
              </svg>
            </div>
            <span className="text-xl font-bold bg-gradient-to-r from-slate-900 via-blue-900 to-indigo-900 bg-clip-text text-transparent">
              KnowledgePlane
            </span>
          </div>
          <div className="flex items-center gap-4">
            <TeamSelector />
            <Link
              href="/dashboard"
              className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                isActive("/dashboard")
                  ? "bg-blue-600 text-white hover:bg-blue-700"
                  : "text-slate-700 hover:text-slate-900 hover:bg-slate-100"
              }`}
            >
              Dashboard
            </Link>
            <Link
              href="/upload"
              className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                isActive("/upload")
                  ? "bg-blue-600 text-white hover:bg-blue-700"
                  : "text-slate-700 hover:text-slate-900 hover:bg-slate-100"
              }`}
            >
              Upload Files
            </Link>
            <Link
              href="/editor"
              className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                isActive("/editor")
                  ? "bg-blue-600 text-white hover:bg-blue-700"
                  : "text-slate-700 hover:text-slate-900 hover:bg-slate-100"
              }`}
            >
              Editor
            </Link>
            <Link
              href="/chat"
              className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                isActive("/chat")
                  ? "bg-blue-600 text-white hover:bg-blue-700"
                  : "text-slate-700 hover:text-slate-900 hover:bg-slate-100"
              }`}
            >
              Chat
            </Link>
            <Link
              href="/teams"
              className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                isActive("/teams")
                  ? "bg-blue-600 text-white hover:bg-blue-700"
                  : "text-slate-700 hover:text-slate-900 hover:bg-slate-100"
              }`}
            >
              Teams
            </Link>
            <Link
              href="/worker-logs"
              className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                isActive("/worker-logs")
                  ? "bg-blue-600 text-white hover:bg-blue-700"
                  : "text-slate-700 hover:text-slate-900 hover:bg-slate-100"
              }`}
            >
              Worker Logs
            </Link>
            
            {/* User Menu with Dropdown */}
            <div className="relative" ref={dropdownRef}>
              <button
                onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-slate-700 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors"
              >
                <div className="text-sm text-slate-600">
                  <span className="font-medium">{user.username}</span>
                  {user.email && (
                    <>
                      <span className="text-slate-400 mx-2">•</span>
                      <span className="text-slate-500">{user.email}</span>
                    </>
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
                <div className="absolute right-0 mt-2 w-48 bg-white rounded-lg shadow-lg border border-slate-200 py-1 z-50">
                  <Link
                    href="/profile"
                    onClick={() => setIsDropdownOpen(false)}
                    className={`w-full text-left px-4 py-2 text-sm transition-colors block ${
                      isActive("/profile")
                        ? "bg-blue-50 text-blue-700 font-medium"
                        : "text-slate-700 hover:bg-slate-100"
                    }`}
                  >
                    Profile
                  </Link>
                  <button
                    onClick={handleLogout}
                    className="w-full text-left px-4 py-2 text-sm text-slate-700 hover:bg-slate-100 transition-colors"
                  >
                    Logout
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </nav>
  );
}

