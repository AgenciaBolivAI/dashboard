"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import { Check, X, Pencil } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { updateLeadStatusAction, updateLeadDealAction } from "@/lib/actions/leads";
import {
  PIPELINE_STAGES,
  STAGE_WIN_PROBABILITY,
  isOpenStage,
  type LeadStatus,
} from "@/lib/leads-types";
import { intentLabel, intentBadgeClass } from "@/lib/leads-intents";
import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";

export type BoardLead = {
  id: string;
  name: string | null;
  status: string;
  intent: string | null;
  value_cents: number | null;
  currency: string | null;
};

const STATUS_KEY: Record<LeadStatus, string> = {
  new: "status_label_new",
  contacted: "status_label_contacted",
  warm: "status_label_warm",
  converted: "status_label_converted",
  not_interested: "status_label_not_interested",
  do_not_contact: "status_label_do_not_contact",
  lost: "status_label_lost",
};

const COLUMN_ACCENT: Record<string, string> = {
  new: "border-t-primary",
  contacted: "border-t-yellow-500",
  warm: "border-t-orange-500",
  converted: "border-t-green-500",
  lost: "border-t-muted-foreground",
};

export function LeadsBoard({
  tenantId,
  leads,
  defaultCurrency,
}: {
  tenantId: string;
  leads: BoardLead[];
  defaultCurrency: string;
}) {
  const t = useTranslations("leads");
  const locale = useLocale();
  const router = useRouter();
  const [items, setItems] = useState<BoardLead[]>(leads);
  const [dragId, setDragId] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [draftValue, setDraftValue] = useState("");

  const byStage = useMemo(() => {
    const map = new Map<string, BoardLead[]>();
    for (const s of PIPELINE_STAGES) map.set(s, []);
    for (const l of items) map.get(l.status)?.push(l);
    return map;
  }, [items]);

  // Header stats: weighted forecast over OPEN stages + total won.
  const stats = useMemo(() => {
    let weighted = 0;
    let won = 0;
    for (const l of items) {
      const v = l.value_cents ?? 0;
      if (l.status === "converted") won += v;
      else if (isOpenStage(l.status)) weighted += v * (STAGE_WIN_PROBABILITY[l.status as LeadStatus] ?? 0);
    }
    return { weighted, won };
  }, [items]);

  async function moveTo(id: string, stage: string) {
    const lead = items.find((l) => l.id === id);
    if (!lead || lead.status === stage) return;
    const prev = lead.status;
    setItems((arr) => arr.map((l) => (l.id === id ? { ...l, status: stage } : l)));
    const res = await updateLeadStatusAction(tenantId, id, stage);
    if (res.error) {
      setItems((arr) => arr.map((l) => (l.id === id ? { ...l, status: prev } : l)));
      toast.error(res.error);
    } else {
      router.refresh();
    }
  }

  function startEdit(l: BoardLead) {
    setEditing(l.id);
    setDraftValue(l.value_cents != null ? String(Math.round(l.value_cents / 100)) : "");
  }

  async function saveValue(l: BoardLead) {
    const raw = draftValue.trim();
    const major = raw === "" ? null : Number(raw);
    if (major != null && (!Number.isFinite(major) || major < 0)) {
      toast.error(t("board_value_invalid"));
      return;
    }
    const value_cents = major == null ? null : Math.round(major * 100);
    setEditing(null);
    setItems((arr) => arr.map((x) => (x.id === l.id ? { ...x, value_cents } : x)));
    const res = await updateLeadDealAction(tenantId, l.id, {
      value_cents,
      currency: l.currency ?? defaultCurrency,
    });
    if (res.error) toast.error(res.error);
    else router.refresh();
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-4 rounded-lg border border-border bg-card px-4 py-3 text-sm">
        <div>
          <span className="text-muted-foreground">{t("board_forecast")}: </span>
          <span className="font-display font-bold">{formatMoney(stats.weighted, defaultCurrency, locale)}</span>
        </div>
        <div>
          <span className="text-muted-foreground">{t("board_won")}: </span>
          <span className="font-display font-bold text-green-600">
            {formatMoney(stats.won, defaultCurrency, locale)}
          </span>
        </div>
      </div>

      <div className="flex gap-3 overflow-x-auto pb-2">
        {PIPELINE_STAGES.map((stage) => {
          const colLeads = byStage.get(stage) ?? [];
          const sum = colLeads.reduce((s, l) => s + (l.value_cents ?? 0), 0);
          return (
            <div
              key={stage}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const id = e.dataTransfer.getData("text/plain") || dragId;
                if (id) moveTo(id, stage);
                setDragId(null);
              }}
              className={cn(
                "w-64 shrink-0 rounded-lg border border-t-2 border-border bg-secondary/30 p-2",
                COLUMN_ACCENT[stage] ?? "border-t-border",
              )}
            >
              <div className="flex items-center justify-between px-1 py-1.5">
                <span className="text-sm font-medium">{t(STATUS_KEY[stage])}</span>
                <span className="text-xs text-muted-foreground">{colLeads.length}</span>
              </div>
              <div className="px-1 pb-2 text-xs text-muted-foreground">
                {formatMoney(sum, defaultCurrency, locale)}
              </div>

              <div className="space-y-2 min-h-12">
                {colLeads.map((l) => (
                  <div
                    key={l.id}
                    draggable={editing !== l.id}
                    onDragStart={(e) => {
                      e.dataTransfer.setData("text/plain", l.id);
                      e.dataTransfer.effectAllowed = "move";
                      setDragId(l.id);
                    }}
                    onDragEnd={() => setDragId(null)}
                    className={cn(
                      "rounded-md border border-border bg-card p-2.5 shadow-sm cursor-grab active:cursor-grabbing",
                      dragId === l.id && "opacity-50",
                    )}
                  >
                    <div className="font-medium text-sm truncate">{l.name || "—"}</div>
                    {l.intent ? (
                      <Badge variant="outline" className={cn("mt-1 text-[10px]", intentBadgeClass(l.intent))}>
                        {intentLabel(l.intent)}
                      </Badge>
                    ) : null}

                    <div className="mt-2 flex items-center gap-1.5">
                      {editing === l.id ? (
                        <div className="flex items-center gap-1 w-full">
                          <input
                            type="number"
                            min={0}
                            autoFocus
                            value={draftValue}
                            onChange={(e) => setDraftValue(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") saveValue(l);
                              if (e.key === "Escape") setEditing(null);
                            }}
                            className="w-full rounded border border-input bg-background px-1.5 py-0.5 text-xs"
                            placeholder="0"
                          />
                          <button
                            type="button"
                            onClick={() => saveValue(l)}
                            className="text-green-600 hover:text-green-700"
                            aria-label={t("board_value_save")}
                          >
                            <Check className="size-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditing(null)}
                            className="text-muted-foreground hover:text-foreground"
                            aria-label={t("import_cancel")}
                          >
                            <X className="size-3.5" />
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => startEdit(l)}
                          className="group inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                        >
                          {l.value_cents != null ? (
                            <span className="font-medium text-foreground">
                              {formatMoney(l.value_cents, l.currency ?? defaultCurrency, locale)}
                            </span>
                          ) : (
                            <span>{t("board_add_value")}</span>
                          )}
                          <Pencil className="size-3 opacity-0 group-hover:opacity-100" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
