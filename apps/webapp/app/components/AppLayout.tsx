"use client";

import { Navigation } from "./Navigation";
import { Sidebar } from "./Sidebar";
import { ReactNode } from "react";
import { SidebarProvider, useSidebar } from "./SidebarContext";

interface AppLayoutProps {
  children: ReactNode;
}

function AppLayoutContent({ children }: AppLayoutProps) {
  const { isCollapsed, setIsCollapsed } = useSidebar();

  return (
    <div className="drawer lg:drawer-open">
      {/* Drawer toggle checkbox */}
      <input
        id="app-drawer"
        type="checkbox"
        className="drawer-toggle"
        checked={!isCollapsed}
        onChange={(e) => setIsCollapsed(!e.target.checked)}
      />

      {/* Main content */}
      <div className="drawer-content flex flex-col">
        <Navigation />
        <main className={`pt-16 min-h-screen transition-[margin] duration-300
          lg:${isCollapsed ? "ml-24" : "ml-72"}
        `}>
          <div className="p-4 sm:p-6 lg:p-8">
            {children}
          </div>
        </main>
      </div>

      {/* Drawer side (sidebar) */}
      <div className="drawer-side z-40 lg:z-40">
        <label
          htmlFor="app-drawer"
          className="drawer-overlay lg:hidden"
          aria-label="close sidebar"
        />
        <Sidebar />
      </div>
    </div>
  );
}

export function AppLayout({ children }: AppLayoutProps) {
  return (
    <SidebarProvider>
      <AppLayoutContent>{children}</AppLayoutContent>
    </SidebarProvider>
  );
}
