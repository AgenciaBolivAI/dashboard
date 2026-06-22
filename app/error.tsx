"use client";

import { useEffect } from "react";

/**
 * Per-route error boundary (recoverable). Catches render errors below the root
 * layout and offers a retry, instead of falling all the way to global-error.
 * Self-contained (no next-intl context) so the boundary itself can't throw.
 */
export default function RouteError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[route-error]", JSON.stringify({
      message: error?.message,
      digest: error?.digest,
      ts: new Date().toISOString(),
    }));
  }, [error]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-6 text-center">
      <div className="max-w-md">
        <p className="font-display text-5xl font-extrabold leading-none text-primary">Ups</p>
        <h1 className="mt-5 text-xl font-semibold text-foreground">Algo salió mal</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Tuvimos un problema inesperado. Ya quedó registrado.
          <br />
          <span className="opacity-70">Something went wrong — it’s been logged. Please try again.</span>
        </p>
        <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
          <button
            type="button"
            onClick={() => reset()}
            className="rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition hover:opacity-90"
          >
            Reintentar
          </button>
          <a
            href="/dashboard"
            className="rounded-lg border border-border px-5 py-2.5 text-sm font-medium text-foreground transition hover:bg-secondary/60"
          >
            Ir al panel
          </a>
        </div>
        {error?.digest ? (
          <p className="mt-4 text-xs text-muted-foreground/60">ref: {error.digest}</p>
        ) : null}
      </div>
    </div>
  );
}
