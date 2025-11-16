import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { appRouter } from "../../../../server/trpc/routes";
import { createContext } from "../../../../server/trpc/context";

// Helper to extract error message from ArangoDB errors
async function extractArangoError(error: any): Promise<string> {
  // Check for ArangoDB-specific error fields first
  if (error.errorNum !== undefined) {
    return `ArangoDB error ${error.errorNum}: ${error.errorMessage || error.message || 'Unknown error'}`;
  }
  
  // If error has a response object with a body, try to read it
  if (error.response) {
    // Try to read the response body if it's a ReadableStream
    if (error.response.body && typeof error.response.body === 'object' && 'getReader' in error.response.body) {
      try {
        const reader = error.response.body.getReader();
        const { value } = await reader.read();
        if (value) {
          const text = new TextDecoder().decode(value);
          try {
            const json = JSON.parse(text);
            return json.errorMessage || json.error || json.message || error.message || 'Unknown database error';
          } catch {
            return text || error.message || 'Unknown database error';
          }
        }
      } catch (e) {
        // If we can't read the body, fall through to other methods
      }
    }
    
    // If response has status, include it
    if (error.response.status) {
      return `Database error (status ${error.response.status}): ${error.message || 'Unknown error'}`;
    }
  }
  
  // Check for error message in standard locations
  if (error.errorMessage) {
    return error.errorMessage;
  }
  
  if (error.message) {
    return error.message;
  }
  
  return String(error);
}

const handler = (req: Request) =>
  fetchRequestHandler({
    endpoint: "/api/trpc",
    req,
    router: appRouter,
    createContext: async (opts) => {
      return createContext({ req: opts.req as any });
    },
    onError: async ({ path, error, type }) => {
      // Extract detailed error message
      const errorMessage = await extractArangoError(error.cause || error);
      
      console.error("[tRPC Error]", {
        path,
        type,
        code: error.code,
        message: error.message,
        cause: errorMessage,
        stack: error.stack,
        // Include full error for debugging
        fullError: error.cause || error,
      });
    },
  });

export { handler as GET, handler as POST };

