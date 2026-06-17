/**
 * Next.js instrumentation — server-side error monitoring.
 *
 * `onRequestError` fires for any uncaught error in Server Components, Route
 * Handlers, and Server Actions. We log a structured line (Vercel captures
 * console output → searchable in the dashboard + log drains) and, if an alert
 * webhook is configured, forward it for real-time alerting (Slack / n8n).
 *
 * No third-party account required. Drop in Sentry later by initialising it in
 * `register()` and reporting from `onRequestError`.
 */
export async function register() {
  // Reserved for tracing/SDK init (e.g. Sentry.init). Intentionally empty.
}

type ReqInfo = { path?: string; method?: string };
type ErrCtx = { routerKind?: string; routePath?: string; renderSource?: string; revalidateReason?: string };

export async function onRequestError(error: unknown, request: ReqInfo, context: ErrCtx) {
  const e = error as { message?: string; stack?: string; digest?: string };
  const payload = {
    level: "error",
    source: "onRequestError",
    message: e?.message ?? String(error),
    digest: e?.digest,
    stack: e?.stack?.split("\n").slice(0, 8).join("\n"),
    method: request?.method,
    path: request?.path,
    routerKind: context?.routerKind,
    routePath: context?.routePath,
    renderSource: context?.renderSource,
    ts: new Date().toISOString(),
  };

  // Always log — Vercel ingests this into its logs / any log drain.
  console.error("[error]", JSON.stringify(payload));

  // Optional real-time alert (no-op unless ERROR_ALERT_WEBHOOK_URL is set).
  const url = process.env.ERROR_ALERT_WEBHOOK_URL;
  if (url) {
    try {
      await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: `🚨 BolivAI error: ${payload.message}`, ...payload }),
      });
    } catch {
      // never let alerting break the request path
    }
  }
}
