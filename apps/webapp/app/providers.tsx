"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import type { ReactNode } from "react";

// Lazy load tRPC to avoid importing it during build/prerender
let trpcModule: typeof import("../utils/trpc") | null = null;
let trpcLoadPromise: Promise<typeof import("../utils/trpc")> | null = null;

function loadTRPC() {
  if (trpcModule) return Promise.resolve(trpcModule);
  if (trpcLoadPromise) return trpcLoadPromise;
  
  trpcLoadPromise = import("../utils/trpc").then((module) => {
    trpcModule = module;
    return module;
  });
  
  return trpcLoadPromise;
}

export function TRPCProvider({ children }: { children: ReactNode }) {
  // Track if component is mounted on client
  // This ensures we don't try to use providers during SSR/build when React context isn't available
  const [mounted, setMounted] = useState(false);
  const [trpcReady, setTrpcReady] = useState(false);
  
  // Initialize query client only on client side
  const [queryClient] = useState<QueryClient | null>(() => {
    // Only create QueryClient on client side
    if (typeof window === "undefined") {
      return null;
    }
    try {
      return new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60 * 1000,
          },
        },
      });
    } catch {
      return null;
    }
  });

  useEffect(() => {
    // Only load providers after mount on client side
    if (typeof window === "undefined") {
      return;
    }
    
    setMounted(true);
    
    // Lazy load tRPC module only on client after mount
    loadTRPC()
      .then(() => {
        setTrpcReady(true);
      })
      .catch(() => {
        // If import fails, just render without providers
        setTrpcReady(false);
      });
  }, []);

  // During SSR/build or before mount, return children without providers
  // This prevents useContext errors during build/prerender when React context isn't initialized
  if (!mounted || !queryClient || typeof window === "undefined" || !trpcReady || !trpcModule) {
    return <>{children}</>;
  }

  // Render providers only when everything is ready
  try {
    const { trpc, trpcClient } = trpcModule;
    return (
      <trpc.Provider client={trpcClient} queryClient={queryClient}>
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
      </trpc.Provider>
    );
  } catch (error) {
    // Fallback if provider initialization fails (e.g., during build)
    // This can happen if React context isn't available
    if (process.env.NODE_ENV === "development") {
      console.warn("TRPCProvider initialization failed, rendering without providers:", error);
    }
    return <>{children}</>;
  }
}

