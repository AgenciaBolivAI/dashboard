"use client";

import { useLocale, useTranslations } from "next-intl";
import { Sparkles, Phone, Flag, ExternalLink, type LucideIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { RecordingPlayer } from "@/components/voice/recording-player";
import { cn } from "@/lib/utils";

/**
 * Unified prospect activity feed (Breakcold-style): merges the lead's creation,
 * BOLIV research, and every call into one chronological timeline. Call entries
 * keep the inline recording player; the provider console link is staff-gated.
 */
export type ActivityItem =
  | { kind: "created"; at: string }
  | { kind: "research"; at: string; headline?: string | null }
  | {
      kind: "call";
      at: string;
      conversationId: string;
      title: string;
      direction?: string | null;
      outcome?: string | null;
      durationSecs: number;
    };

const ICON: Record<ActivityItem["kind"], LucideIcon> = {
  created: Flag,
  research: Sparkles,
  call: Phone,
};

const ICON_TONE: Record<ActivityItem["kind"], string> = {
  created: "text-muted-foreground bg-secondary",
  research: "text-primary bg-primary/10",
  call: "text-emerald-600 bg-emerald-500/10",
};

function fmtDuration(secs: number): string {
  const m = Math.floor(secs / 60);
  const s = Math.round(secs % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function ActivityTimeline({
  items,
  timezone,
  isStaff,
}: {
  items: ActivityItem[];
  timezone: string;
  isStaff: boolean;
}) {
  const t = useTranslations("prospect");
  const locale = useLocale();

  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground py-4 text-center">{t("timeline_empty")}</p>;
  }

  const when = (iso: string) =>
    new Date(iso).toLocaleString(locale, { dateStyle: "medium", timeStyle: "short", timeZone: timezone });

  return (
    <ol className="relative space-y-5">
      {/* vertical rail */}
      <span className="absolute left-[15px] top-2 bottom-2 w-px bg-border" aria-hidden />
      {items.map((it, i) => {
        const Icon = ICON[it.kind];
        return (
          <li key={i} className="relative flex gap-3">
            <span
              className={cn(
                "relative z-10 grid place-items-center size-8 rounded-full shrink-0 ring-4 ring-card",
                ICON_TONE[it.kind],
              )}
            >
              <Icon className="size-4" />
            </span>
            <div className="flex-1 min-w-0 pt-0.5">
              {it.kind === "created" ? (
                <p className="text-sm font-medium">{t("timeline_created")}</p>
              ) : it.kind === "research" ? (
                <p className="text-sm font-medium flex items-center gap-1.5">
                  {t("timeline_research")}
                </p>
              ) : (
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium">{it.title || t("timeline_call")}</span>
                      {it.direction ? (
                        <Badge variant="outline" className="text-[10px]">{it.direction}</Badge>
                      ) : null}
                      {it.outcome ? (
                        <Badge
                          variant="outline"
                          className={
                            it.outcome === "success"
                              ? "text-[10px] bg-emerald-500/10 text-emerald-600 border-emerald-500/30"
                              : "text-[10px] bg-amber-500/10 text-amber-600 border-amber-500/30"
                          }
                        >
                          {it.outcome}
                        </Badge>
                      ) : null}
                    </div>
                  </div>
                  {it.conversationId ? (
                    <div className="flex items-center gap-3 shrink-0">
                      <RecordingPlayer conversationId={it.conversationId} durationSeconds={it.durationSecs} />
                      {isStaff ? (
                        <a
                          href={`https://elevenlabs.io/app/conversational-ai/history/${it.conversationId}`}
                          target="_blank"
                          rel="noopener"
                          title="Provider console"
                          className="text-muted-foreground hover:text-foreground"
                        >
                          <ExternalLink className="size-3.5" />
                        </a>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              )}
              <p className="text-xs text-muted-foreground mt-0.5">
                {when(it.at)}
                {it.kind === "call" ? <> · {fmtDuration(it.durationSecs)}</> : null}
                {it.kind === "research" && it.headline ? <> · {it.headline}</> : null}
              </p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
