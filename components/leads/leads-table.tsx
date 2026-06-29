"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { PhoneCall, Loader2, Trash2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import Link from "next/link";
import { useParams } from "next/navigation";
import { addLeadsToSandraQueueAction } from "@/lib/actions/sandra-queue";
import { initiateBatchSandraCallAction } from "@/lib/actions/voice";
import { updateLeadStatusAction, deleteLeadAction } from "@/lib/actions/leads";
import { LEAD_STATUSES, type LeadStatus } from "@/lib/leads-types";
import { intentLabel, intentBadgeClass } from "@/lib/leads-intents";
import { getCountryFromPhone, getStateFromMetadata } from "@/lib/leads-geo";
import { formatDate, cn } from "@/lib/utils";
import { CallSandraButton } from "./call-sandra-button";
import { LeadWebsiteCell } from "./lead-website-cell";

export type LeadFromQuery = {
  id: string;
  name: string | null;
  whatsapp_number: string | null;
  email: string | null;
  intent: string | null;
  status: string;
  created_at: string;
  conversation_id?: string | null;
  notes?: string | null;
  website?: string | null;
  source?: string | null;
  metadata?: { city?: string; vertical?: string; website?: string; primary_type?: string } | null;
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

const STATUS_CLASS: Record<LeadStatus, string> = {
  new: "bg-primary/10 text-primary border-primary/30 hover:bg-primary/15",
  contacted: "bg-yellow-500/10 text-yellow-600 border-yellow-500/30 hover:bg-yellow-500/15",
  warm: "bg-orange-500/10 text-orange-600 border-orange-500/30 hover:bg-orange-500/15",
  converted: "bg-green-500/10 text-green-600 border-green-500/30 hover:bg-green-500/15",
  not_interested: "bg-slate-500/10 text-slate-600 border-slate-500/30 hover:bg-slate-500/15",
  do_not_contact: "bg-red-500/10 text-red-600 border-red-500/30 hover:bg-red-500/15",
  lost: "bg-muted text-muted-foreground border-border hover:bg-muted/80",
};

export function LeadsTable({
  tenantId,
  leads,
  researchedIds,
}: {
  tenantId: string;
  leads: LeadFromQuery[];
  researchedIds?: string[];
}) {
  const params = useParams<{ tenantSlug?: string }>();
  const tenantSlugParam = params?.tenantSlug ?? "";
  const t = useTranslations("leads");
  const locale = useLocale();
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [adding, startAdd] = useTransition();
  const [rowPending, startRowPending] = useTransition();
  const researched = useMemo(() => new Set(researchedIds ?? []), [researchedIds]);

  const callableIds = useMemo(
    () => leads.filter((l) => !!l.whatsapp_number).map((l) => l.id),
    [leads],
  );

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAllCallable() {
    setSelected((prev) => (prev.size > 0 ? new Set() : new Set(callableIds)));
  }

  function addToSandra() {
    if (selected.size === 0) {
      toast.error(t("select_at_least_one"));
      return;
    }
    startAdd(async () => {
      const res = await addLeadsToSandraQueueAction(tenantId, [...selected]);
      if (res.error) {
        toast.error(res.error);
        return;
      }
      const added = res.count ?? 0;
      const skipped = selected.size - added;
      toast.success(
        added === 0
          ? t("queue_all_already_present")
          : skipped > 0
            ? t("queue_partial", { added, skipped })
            : t("queue_added", { added }),
      );
      setSelected(new Set());
      router.refresh();
    });
  }

  function callSelectedBatch() {
    if (selected.size === 0) {
      toast.error(t("select_at_least_one"));
      return;
    }
    if (selected.size > 100 && !confirm(t("batch_call_confirm", { count: selected.size }))) return;
    startAdd(async () => {
      const res = await initiateBatchSandraCallAction({
        tenant_id: tenantId,
        lead_ids: [...selected],
        batch_name: `${t("batch_name_prefix")} ${selected.size} — ${new Date().toLocaleString()}`,
      });
      if (res.error) {
        toast.error(res.error);
        return;
      }
      const parts: string[] = [t("batch_started", { count: res.queued })];
      if (res.skipped_dnc > 0) parts.push(t("batch_blocked_dnc", { count: res.skipped_dnc }));
      if (res.skipped_no_phone > 0) parts.push(t("batch_no_phone", { count: res.skipped_no_phone }));
      toast.success(parts.join(" · "), {
        action: res.batch_id
          ? {
              label: t("batch_view_in_eleven"),
              onClick: () =>
                window.open(
                  `https://elevenlabs.io/app/conversational-ai/batch-calling/${res.batch_id}`,
                  "_blank",
                ),
            }
          : undefined,
      });
      setSelected(new Set());
      router.refresh();
    });
  }

  function handleStatusChange(leadId: string, next: string) {
    startRowPending(async () => {
      const res = await updateLeadStatusAction(tenantId, leadId, next);
      if (res.error) toast.error(res.error);
      else {
        toast.success(
          t("status_marked_as", {
            status: STATUS_KEY[next as LeadStatus] ? t(STATUS_KEY[next as LeadStatus]) : next,
          }),
        );
        router.refresh();
      }
    });
  }

  function handleDelete(leadId: string) {
    if (!confirm(t("confirm_delete"))) return;
    startRowPending(async () => {
      const res = await deleteLeadAction(tenantId, leadId);
      if (res.error) toast.error(res.error);
      else {
        toast.success(t("deleted"));
        router.refresh();
      }
    });
  }

  if (leads.length === 0) return null;

  return (
    <>
      <div className="mb-3 flex items-center justify-between flex-wrap gap-3">
        <p className="text-sm text-muted-foreground">
          {selected.size > 0
            ? t("counter_selected", { selected: selected.size, callable: callableIds.length })
            : t("counter_total", { total: leads.length, callable: callableIds.length })}
        </p>
        <div className="flex gap-2 flex-wrap">
          {selected.size > 0 ? (
            <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
              {t("clear")}
            </Button>
          ) : null}
          <Button
            size="sm"
            variant="outline"
            onClick={toggleAllCallable}
            disabled={callableIds.length === 0}
          >
            {selected.size === callableIds.length && callableIds.length > 0
              ? t("deselect_all")
              : t("select_all", { count: callableIds.length })}
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={callSelectedBatch}
            disabled={adding || selected.size === 0}
            className="gap-1.5"
            title={t("batch_call_tooltip")}
          >
            {adding ? <Loader2 className="size-4 animate-spin" /> : <PhoneCall className="size-4 text-emerald-500" />}
            {t("batch_call_button")}
          </Button>
          <Button
            size="sm"
            onClick={addToSandra}
            disabled={adding || selected.size === 0}
            className="gap-1.5"
          >
            {adding ? <Loader2 className="size-4 animate-spin" /> : <PhoneCall className="size-4" />}
            {t("add_to_sandra_queue")}
          </Button>
        </div>
      </div>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-8" />
              <TableHead>{t("col_name")}</TableHead>
              <TableHead>{t("col_contact")}</TableHead>
              <TableHead>{t("col_website")}</TableHead>
              <TableHead>{t("col_intent")}</TableHead>
              <TableHead>{t("col_status")}</TableHead>
              <TableHead className="w-32">{t("col_captured")}</TableHead>
              <TableHead className="w-12" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {leads.map((l) => {
              const canSelect = !!l.whatsapp_number;
              const statusKey = (LEAD_STATUSES as readonly string[]).includes(l.status)
                ? (l.status as LeadStatus)
                : "new";
              return (
                <TableRow key={l.id} className={cn(!canSelect && "opacity-70", rowPending && "transition-opacity")}>
                  <TableCell className="w-8">
                    <input
                      type="checkbox"
                      checked={selected.has(l.id)}
                      disabled={!canSelect}
                      onChange={() => toggle(l.id)}
                      className="size-4 rounded border cursor-pointer disabled:opacity-30"
                      title={canSelect ? t("checkbox_select") : t("checkbox_no_phone")}
                    />
                  </TableCell>
                  <TableCell className="font-medium">
                    <div className="flex items-center gap-1.5">
                      <Link
                        href={`/dashboard/${tenantSlugParam}/leads/${l.id}`}
                        className="hover:text-primary hover:underline"
                      >
                        {l.name ?? "—"}
                      </Link>
                      {researched.has(l.id) ? (
                        <span title={t("researched_by_boliv")} className="inline-flex shrink-0">
                          <Sparkles className="size-3.5 text-primary" />
                        </span>
                      ) : null}
                    </div>
                  </TableCell>
                  <TableCell className="text-sm">
                    {l.whatsapp_number ? (
                      <div className="flex items-center gap-1.5">
                        {(() => {
                          const c = getCountryFromPhone(l.whatsapp_number);
                          return c ? (
                            <span title={c.name}>{c.flag}</span>
                          ) : null;
                        })()}
                        <span>+{l.whatsapp_number}</span>
                      </div>
                    ) : null}
                    {l.email ? <div className="text-muted-foreground text-xs">{l.email}</div> : null}
                    {(() => {
                      const s = getStateFromMetadata(l.metadata);
                      const city = l.metadata?.city;
                      const parts = [city, s].filter(Boolean);
                      return parts.length ? (
                        <div className="text-muted-foreground text-xs mt-0.5">
                          {parts.join(" · ")}
                        </div>
                      ) : null;
                    })()}
                  </TableCell>
                  <TableCell>
                    <LeadWebsiteCell
                      tenantId={tenantId}
                      leadId={l.id}
                      website={l.website ?? l.metadata?.website ?? null}
                    />
                  </TableCell>
                  <TableCell>
                    {l.intent ? (
                      <Badge variant="outline" className={intentBadgeClass(l.intent)}>
                        {intentLabel(l.intent)}
                      </Badge>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <select
                      value={l.status}
                      onChange={(e) => handleStatusChange(l.id, e.target.value)}
                      disabled={rowPending}
                      className={cn(
                        "rounded-md border px-2 py-1 text-xs font-medium cursor-pointer transition focus:outline-none focus:ring-2 focus:ring-ring",
                        STATUS_CLASS[statusKey],
                        rowPending && "opacity-50",
                      )}
                    >
                      {LEAD_STATUSES.map((s) => (
                        <option key={s} value={s}>
                          {t(STATUS_KEY[s])}
                        </option>
                      ))}
                    </select>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {formatDate(l.created_at, locale)}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1 justify-end">
                      {/* Call button is hidden for DNC'd leads. The button itself
                          also no-ops on DNC defensively, but hiding is cleaner UX. */}
                      {l.whatsapp_number && l.status !== "do_not_contact" ? (
                        <CallSandraButton
                          tenantId={tenantId}
                          leadId={l.id}
                          phone={`+${l.whatsapp_number}`}
                          leadName={l.name}
                          leadCompany={l.metadata?.vertical ?? null}
                          notes={l.notes ?? null}
                          size="sm"
                          variant="ghost"
                        />
                      ) : null}
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDelete(l.id)}
                        disabled={rowPending}
                        className="text-muted-foreground hover:text-destructive"
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Card>
    </>
  );
}
