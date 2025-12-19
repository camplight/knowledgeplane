"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import type { ReactNode } from "react";
import { trpc, getTrpcClient } from "../utils/trpc";

export function TRPCProvider({ children }: { children: ReactNode }) {
  // Initialize query client - create it once using useState initializer
  // This ensures we have a stable reference across re-renders and navigation
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60 * 1000,
            refetchOnWindowFocus: false,
          },
        },
      })
  );

  // Create tRPC client lazily when provider mounts
  // This ensures it's created on the client side with the correct configuration
  const trpcClient = useMemo(() => getTrpcClient(), []);

  // Always render the providers
  // Since this is a "use client" component, it only renders on the client side
  // The tRPC hooks require the provider to be in the React tree
  // Using stable references ensures the provider doesn't get recreated during navigation
  return (
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </trpc.Provider>
  );
}

