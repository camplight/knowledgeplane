"use client";

import md5 from "md5";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { trpc } from "../../utils/trpc";
import { useSidebar } from "./SidebarContext";

const dashboardIconPath =
  "M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6";
const uploadIconPath =
  "M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12";
const editorIconPath =
  "M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z";
const chatIconPath =
  "M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z";
const dataSourcesIconPath =
  "M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4";
const workspacesIconPath =
  "M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10";
const workerLogsIconPath =
  "M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z";
const profileSettingsIconPath =
  "M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z";
const profileSettingsUserIconPath = "M15 12a3 3 0 11-6 0 3 3 0 016 0z";
const logoutIconPath =
  "M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1";

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: dashboardIconPath },
  { href: "/upload", label: "Upload Files", icon: uploadIconPath },
  { href: "/editor", label: "Editor", icon: editorIconPath },
  { href: "/chat", label: "Chat", icon: chatIconPath },
  { href: "/data-sources", label: "Data Sources", icon: dataSourcesIconPath },
];

const getGravatarUrl = (email: string, size: number = 80) => {
  const hash = md5(email.toLowerCase().trim());
  return `https://www.gravatar.com/avatar/${hash}?s=${size}&d=identicon`;
};

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { isCollapsed, setIsCollapsed } = useSidebar();
  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);
  const profileMenuRef = useRef<HTMLDivElement | null>(null);

  const { data: userData } = trpc.auth.me.useQuery();
  const logoutMutation = trpc.auth.logout.useMutation({
    onSuccess: () => {
      router.push("/");
    },
  });

  const handleLogout = () => {
    logoutMutation.mutate();
  };

  const bottomQuickActions = [
    {
      id: "workspaces",
      kind: "link" as const,
      href: "/workspaces",
      label: "Workspaces",
      iconPath: workspacesIconPath,
    },
    {
      id: "worker-logs",
      kind: "link" as const,
      href: "/worker-logs",
      label: "Worker Logs",
      iconPath: workerLogsIconPath,
    },
  ];

  const isActive = (path: string) => pathname === path;

  if (!userData?.user) return null;

  const user = userData.user;

  useEffect(() => {
    if (!isProfileMenuOpen) return;

    const onMouseDown = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (profileMenuRef.current?.contains(target)) return;
      setIsProfileMenuOpen(false);
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsProfileMenuOpen(false);
    };

    document.addEventListener("mousedown", onMouseDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onMouseDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [isProfileMenuOpen]);

  return (
    <aside
      className={`h-full min-h-screen bg-base-100 border-r border-base-300 transition-all duration-300 ease-in-out flex flex-col pt-16
        ${isCollapsed ? "w-24" : "w-72"}
      `}
      style={{
        backgroundImage:
          "radial-gradient(circle at 50% 50%, rgba(251, 191, 36, 0.03) 0%, transparent 70%)",
      }}
    >
      {/* Collapse Toggle Button - Desktop only */}
      <button
        onClick={() => setIsCollapsed(!isCollapsed)}
        className="hidden lg:flex absolute -right-6 top-6 w-6 h-6 bg-primary rounded-full items-center justify-center shadow-lg hover:scale-110 transition-transform z-10"
        title={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
      >
        <svg
          className={`w-3 h-3 text-primary-content transition-transform duration-300 ${isCollapsed ? "rotate-180" : ""}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={3}
            d="M15 19l-7-7 7-7"
          />
        </svg>
      </button>

      {/* Mobile Close Button */}
      <label
        htmlFor="app-drawer"
        className="lg:hidden btn btn-sm btn-circle btn-ghost absolute right-2 top-2"
        aria-label="Close menu"
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
            d="M6 18L18 6M6 6l12 12"
          />
        </svg>
      </label>

      {/* Navigation Items */}
      <nav className="p-3 space-y-2 flex-1 overflow-y-auto">
        {navItems.map((item) => {
          const active = isActive(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`
                group relative flex items-center gap-4 px-4 py-3.5 rounded-lg
                transition-all duration-200 font-mono text-sm
                ${
                  active
                    ? "bg-primary/10 text-primary shadow-sm border border-primary/20"
                    : "hover:bg-base-200 text-base-content/70 hover:text-base-content border border-transparent"
                }
                ${isCollapsed ? "justify-center" : ""}
              `}
              title={isCollapsed ? item.label : undefined}
            >
              {/* Icon */}
              <svg
                className={`shrink-0 transition-all duration-200 ${
                  active ? "w-6 h-6" : "w-5 h-5 group-hover:w-6 group-hover:h-6"
                }`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d={item.icon}
                />
              </svg>

              {/* Label */}
              {!isCollapsed && (
                <span
                  className={`font-medium ${active ? "font-semibold" : ""}`}
                >
                  {item.label}
                </span>
              )}

              {/* Active Indicator */}
              {active && (
                <div className="absolute right-3 w-1.5 h-1.5 bg-primary rounded-full" />
              )}
            </Link>
          );
        })}
      </nav>

      {/* Profile Section at Bottom */}
      <div className="mt-auto border-t border-base-300">
        {!isCollapsed ? (
          <div className="p-3">
            {/* Bottom Quick Actions */}
            <div className="space-y-1">
              {bottomQuickActions.map((action) => {
                const active = isActive(action.href);
                const baseClass =
                  "flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-mono transition-colors";
                const className = `${baseClass} ${
                  active ? "bg-primary/10 text-primary" : "hover:bg-base-200"
                }`;

                const icon = (
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
                      d={action.iconPath}
                    />
                  </svg>
                );

                return (
                  <Link
                    key={action.id}
                    href={action.href}
                    className={className}
                  >
                    {icon}
                    <span>{action.label}</span>
                  </Link>
                );
              })}
            </div>

            {/* Profile Card (last) */}
            <div className="relative mt-2" ref={profileMenuRef}>
              <button
                type="button"
                onClick={() => setIsProfileMenuOpen((v) => !v)}
                className="w-full flex items-center gap-3 p-3 rounded-lg bg-base-200/50 hover:bg-base-200 transition-colors"
                aria-haspopup="menu"
                aria-expanded={isProfileMenuOpen}
              >
                <img
                  src={getGravatarUrl(user.email)}
                  alt={user.username}
                  className="w-10 h-10 rounded-full ring-2 ring-primary/20"
                />
                <div className="flex-1 min-w-0 text-left">
                  <p className="text-sm font-semibold font-mono text-base-content truncate">
                    {user.username}
                  </p>
                  <p className="text-xs text-base-content/60 font-mono truncate">
                    {user.email}
                  </p>
                </div>
                <svg
                  className="w-4 h-4 opacity-60"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {isProfileMenuOpen && (
                <div
                  role="menu"
                  className="absolute bottom-full left-0 mb-2 w-full rounded-lg border border-base-300 bg-base-100 shadow-xl p-1 z-50"
                >
                  <Link
                    role="menuitem"
                    href="/profile"
                    onClick={() => setIsProfileMenuOpen(false)}
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-mono transition-colors ${
                      isActive("/profile")
                        ? "bg-primary/10 text-primary"
                        : "hover:bg-base-200"
                    }`}
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={profileSettingsIconPath} />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={profileSettingsUserIconPath} />
                    </svg>
                    <span>Profile Settings</span>
                  </Link>
                  <button
                    role="menuitem"
                    type="button"
                    onClick={() => {
                      setIsProfileMenuOpen(false);
                      handleLogout();
                    }}
                    className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-mono hover:bg-error/10 hover:text-error transition-colors"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={logoutIconPath} />
                    </svg>
                    <span>Logout</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="p-3 flex flex-col items-center gap-2">
            {/* Bottom Quick Actions */}
            {bottomQuickActions.map((action) => {
              const active = isActive(action.href);
              const baseClass = "btn btn-ghost btn-sm btn-circle";
              const className = `${baseClass} ${active ? "text-primary" : ""}`;

              const icon = (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={action.iconPath} />
                </svg>
              );

              return (
                <Link key={action.id} href={action.href} className={className} title={action.label}>
                  {icon}
                </Link>
              );
            })}

            {/* Profile Card (last) */}
            <div className="relative mt-1" ref={profileMenuRef}>
              <button
                type="button"
                onClick={() => setIsProfileMenuOpen((v) => !v)}
                className="rounded-full ring-2 ring-primary/20 hover:ring-primary/40 transition-all"
                title={user.username}
                aria-haspopup="menu"
                aria-expanded={isProfileMenuOpen}
              >
                <img
                  src={getGravatarUrl(user.email)}
                  alt={user.username}
                  className="w-10 h-10 rounded-full"
                />
              </button>

              {isProfileMenuOpen && (
                <div
                  role="menu"
                  className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-52 rounded-lg border border-base-300 bg-base-100 shadow-xl p-1 z-50"
                >
                  <Link
                    role="menuitem"
                    href="/profile"
                    onClick={() => setIsProfileMenuOpen(false)}
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-mono transition-colors ${
                      isActive("/profile")
                        ? "bg-primary/10 text-primary"
                        : "hover:bg-base-200"
                    }`}
                  >
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
                        d={profileSettingsIconPath}
                      />
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d={profileSettingsUserIconPath}
                      />
                    </svg>
                    <span>Profile Settings</span>
                  </Link>
                  <button
                    role="menuitem"
                    type="button"
                    onClick={() => {
                      setIsProfileMenuOpen(false);
                      handleLogout();
                    }}
                    className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-mono hover:bg-error/10 hover:text-error transition-colors"
                  >
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
                        d={logoutIconPath}
                      />
                    </svg>
                    <span>Logout</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}
