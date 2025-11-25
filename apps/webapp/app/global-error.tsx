"use client";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  // Minimal error handler - no imports that might use context
  return (
    <html lang="en">
      <body>
        <div style={{ padding: "2rem", textAlign: "center" }}>
          <h1>Something went wrong!</h1>
          <p>{error?.message || "An unexpected error occurred"}</p>
          <button onClick={() => typeof reset === "function" ? reset() : typeof window !== "undefined" ? window.location.reload() : null}>
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
