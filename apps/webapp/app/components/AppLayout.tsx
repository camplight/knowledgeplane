"use client";

import { Navigation } from "./Navigation";
import { Sidebar } from "./Sidebar";
import { ReactNode } from "react";

interface AppLayoutProps {
  children: ReactNode;
}

export function AppLayout({ children }: AppLayoutProps) {
  return (
    <>
      <Navigation />
      <Sidebar />
      <main className="ml-64 pt-16 min-h-screen">
        <div className="p-8">
          {children}
        </div>
      </main>
    </>
  );
}
