"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { trpc, trpcClient } from "../utils/trpc";

export function TRPCProvider({ children }: { children: React.ReactNode }) {
  // During build time, React context might not be available
  // Check if we're in a build context by checking if window is undefined
  // and if React context is available
  if (typeof window === "undefined") {
    // During SSR/build, return children without providers to avoid context issues
    return <>{children}</>;
  }

  try {
    const [queryClient] = useState(() => new QueryClient());
    const [trpcClientInstance] = useState(() => trpcClient);

    return (
      <trpc.Provider client={trpcClientInstance} queryClient={queryClient}>
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
      </trpc.Provider>
    );
  } catch (error) {
    // Fallback during build or if context isn't available
    return <>{children}</>;
  }
}

