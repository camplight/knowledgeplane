import { createTRPCReact } from "@trpc/react-query";
import { httpBatchLink } from "@trpc/client";
import superjson from "superjson";
import type { AppRouter } from "../server/trpc/routes";

// Create trpc instance - createTRPCReact doesn't access React context at module load time
// It only accesses context when hooks are called, so this should be safe
export const trpc = createTRPCReact<AppRouter>();

export const getBaseUrl = () => {
  if (typeof window !== "undefined") return "";
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return `http://localhost:${process.env.PORT ?? 3000}`;
};

// Create client function - creates the client when called
// This ensures the client is created with the correct base URL for the current environment
function createTRPCClient() {
  return trpc.createClient({
    links: [
      httpBatchLink({
        url: `${getBaseUrl()}/api/trpc`,
        transformer: superjson,
        fetch(url, options) {
          return fetch(url, {
            ...options,
            credentials: "include",
          });
        },
      }),
    ],
  });
}

// Export a getter that creates the client lazily
// This ensures the client is only created when needed and with the correct base URL
let _trpcClient: ReturnType<typeof createTRPCClient> | null = null;

export const getTrpcClient = () => {
  if (!_trpcClient) {
    _trpcClient = createTRPCClient();
  }
  return _trpcClient;
};

// For backward compatibility, create client immediately
// This should be safe since getBaseUrl() checks for window first
export const trpcClient = createTRPCClient();

