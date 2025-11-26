"use client";

// Skip static generation for global error page - this should never be prerendered
// These exports tell Next.js to never statically generate this page
export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';
export const dynamicParams = true;

// global-error.tsx is a special Next.js file that handles errors in the root layout
// It MUST wrap the entire HTML structure and cannot use the root layout or any providers
// This file is completely standalone and doesn't depend on React context

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body>
        <div style={{ padding: "2rem", textAlign: "center", fontFamily: "system-ui, sans-serif" }}>
          <h1 style={{ fontSize: "2rem", marginBottom: "1rem" }}>Something went wrong!</h1>
          <p style={{ fontSize: "1.125rem", color: "#666", marginBottom: "0.5rem" }}>
            {error?.message || "An unexpected error occurred"}
          </p>
          {error?.digest && (
            <p style={{ fontSize: "0.875rem", color: "#999", marginBottom: "1rem" }}>
              Error ID: {error.digest}
            </p>
          )}
          {reset && (
            <button
              onClick={reset}
              style={{
                marginTop: "1rem",
                padding: "0.75rem 1.5rem",
                fontSize: "1rem",
                cursor: "pointer",
                backgroundColor: "#0070f3",
                color: "white",
                border: "none",
                borderRadius: "0.375rem",
              }}
            >
              Try again
            </button>
          )}
        </div>
      </body>
    </html>
  );
}

