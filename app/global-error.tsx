"use client";

import { useEffect } from "react";

/**
 * Root error boundary — catches errors thrown in the root layout/render that
 * the per-route error.tsx can't. Replaces the whole document, so it must render
 * its own <html>/<body>. Logs to the console (Vercel captures it).
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[global-error]", JSON.stringify({
      message: error?.message,
      digest: error?.digest,
      stack: error?.stack?.split("\n").slice(0, 8).join("\n"),
      ts: new Date().toISOString(),
    }));
  }, [error]);

  return (
    <html lang="en">
      <body style={{ margin: 0, fontFamily: "system-ui, sans-serif", background: "#0a0a0a", color: "#fff" }}>
        <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
          <div style={{ maxWidth: 420, textAlign: "center" }}>
            <div style={{ fontFamily: "Georgia, serif", fontWeight: 800, fontSize: 24, marginBottom: 16 }}>
              Boliv<span style={{ color: "#00e5a0" }}>AI</span>
            </div>
            <h1 style={{ fontSize: 20, margin: "0 0 8px" }}>Something went wrong</h1>
            <p style={{ color: "#999", fontSize: 14, lineHeight: 1.6, margin: "0 0 20px" }}>
              We hit an unexpected problem. It has been logged. Please try again.
            </p>
            <button
              onClick={() => reset()}
              style={{ background: "#00e5a0", color: "#000", fontWeight: 700, border: "none", padding: "10px 24px", borderRadius: 10, cursor: "pointer", fontSize: 14 }}
            >
              Try again
            </button>
            {error?.digest ? (
              <p style={{ color: "#555", fontSize: 11, marginTop: 16 }}>ref: {error.digest}</p>
            ) : null}
          </div>
        </div>
      </body>
    </html>
  );
}
