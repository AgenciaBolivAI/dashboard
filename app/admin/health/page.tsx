import type { SupabaseClient } from "@supabase/supabase-js";
import { CheckCircle2, XCircle, Activity } from "lucide-react";
import { createServiceClient } from "@/lib/supabase/service";
import { runHealthChecks, summarize, type CheckResult } from "@/lib/health/checks";
import en from "@/messages/en.json";
import es from "@/messages/es.json";
import pt from "@/messages/pt.json";
import fr from "@/messages/fr.json";
import it from "@/messages/it.json";

// Live system status — never cached.
export const dynamic = "force-dynamic";

export default async function HealthPage() {
  const sb = createServiceClient() as unknown as SupabaseClient;
  const messages = { en, es, pt, fr, it } as Record<string, unknown>;
  const groups = await runHealthChecks(sb, messages, process.env as Record<string, string | undefined>);
  const sum = summarize(groups);

  return (
    <div className="p-6 md:p-8 max-w-5xl space-y-6">
      {/* Overall banner */}
      <div
        className={[
          "rounded-2xl border p-6 flex items-center gap-4",
          sum.ok
            ? "border-emerald-500/40 bg-emerald-500/10"
            : "border-red-500/40 bg-red-500/10",
        ].join(" ")}
      >
        {sum.ok ? (
          <CheckCircle2 className="size-10 text-emerald-500 shrink-0" />
        ) : (
          <XCircle className="size-10 text-red-500 shrink-0" />
        )}
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-display font-extrabold tracking-tight flex items-center gap-2">
            <Activity className="size-5 text-primary" />
            {sum.ok ? "All systems healthy" : `${sum.failed} check${sum.failed === 1 ? "" : "s"} failing`}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {sum.passed}/{sum.total} passing · live checks (DB, schema, pricing, translations, environment).
            For type/build safety run <code className="text-foreground">npm run health</code> before deploy.
          </p>
        </div>
        <div
          className={[
            "shrink-0 rounded-xl px-4 py-2 text-2xl font-display font-extrabold tabular-nums",
            sum.ok ? "text-emerald-500" : "text-red-500",
          ].join(" ")}
        >
          {sum.passed}/{sum.total}
        </div>
      </div>

      {/* Groups */}
      <div className="grid gap-4 md:grid-cols-2">
        {groups.map((g) => {
          const failed = g.results.filter((r) => !r.ok).length;
          return (
            <div key={g.group} className="rounded-xl border border-border bg-card p-4">
              <div className="flex items-center justify-between mb-3">
                <h2 className="font-display font-semibold">{g.group}</h2>
                <span
                  className={[
                    "text-xs font-bold rounded-full px-2 py-0.5",
                    failed === 0
                      ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                      : "bg-red-500/10 text-red-600 dark:text-red-400",
                  ].join(" ")}
                >
                  {g.results.length - failed}/{g.results.length}
                </span>
              </div>
              <ul className="space-y-1.5">
                {g.results.map((r) => (
                  <Row key={r.name} r={r} />
                ))}
              </ul>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Row({ r }: { r: CheckResult }) {
  return (
    <li className="flex items-start gap-2 text-sm">
      {r.ok ? (
        <CheckCircle2 className="size-4 text-emerald-500 shrink-0 mt-0.5" />
      ) : (
        <XCircle className="size-4 text-red-500 shrink-0 mt-0.5" />
      )}
      <div className="min-w-0 flex-1">
        <span className={r.ok ? "text-foreground" : "text-red-600 dark:text-red-400 font-medium"}>{r.name}</span>
        {!r.ok && r.detail ? <p className="text-xs text-muted-foreground break-words">{r.detail}</p> : null}
      </div>
    </li>
  );
}
