"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  Mail, MessageCircle, Smartphone, Sparkles, Users, Check, Pause, Play, X, Loader2, Plus, Send,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  createBroadcastAction, approveBroadcastAction, pauseBroadcastAction,
  resumeBroadcastAction, cancelBroadcastAction, previewAudienceAction, draftBroadcastCopyAction,
} from "@/lib/actions/marketing";
import type { MarketingCampaignRow, BroadcastStatus } from "@/lib/queries/marketing";
import type { MarketingChannel } from "@/lib/marketing/channels";
import { cn } from "@/lib/utils";

const FIELD_CLASS =
  "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2";

const STATUS_CLASS: Record<BroadcastStatus, string> = {
  draft: "bg-slate-500/10 text-slate-600 border-slate-500/30",
  approved: "bg-blue-500/10 text-blue-600 border-blue-500/30",
  running: "bg-primary/10 text-primary border-primary/30",
  paused: "bg-yellow-500/10 text-yellow-600 border-yellow-500/30",
  done: "bg-green-500/10 text-green-600 border-green-500/30",
  cancelled: "bg-red-500/10 text-red-600 border-red-500/30",
};

const CHANNEL_ICON: Record<MarketingChannel, typeof Mail> = {
  email: Mail,
  whatsapp: MessageCircle,
  sms: Smartphone,
};

type Source = "leads" | "customers" | "both";

export function BroadcastsManager({
  tenantId,
  campaigns,
}: {
  tenantId: string;
  campaigns: MarketingCampaignRow[];
}) {
  const t = useTranslations("broadcasts");
  const tc = useTranslations("common");
  const locale = useLocale();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);

  function act(fn: (tid: string, id: string) => Promise<{ ok: boolean; error?: string; count?: number }>, id: string) {
    startTransition(async () => {
      const res = await fn(tenantId, id);
      if (!res.ok) toast.error(res.error ?? tc("error"));
      else {
        if (typeof res.count === "number") toast.success(t("enqueued", { count: res.count }));
        router.refresh();
      }
    });
  }

  const fmt = (iso: string | null) =>
    iso ? new Date(iso).toLocaleString(locale, { dateStyle: "medium", timeStyle: "short" }) : t("asap");

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={() => setOpen(true)}>
          <Plus className="size-4" />
          {t("new")}
        </Button>
      </div>

      {campaigns.length === 0 ? (
        <Card className="py-16 flex flex-col items-center text-center">
          <Send className="size-10 text-muted-foreground mb-4" />
          <p className="font-medium">{t("empty_title")}</p>
          <p className="text-sm text-muted-foreground mt-1 max-w-md">{t("empty_subtitle")}</p>
        </Card>
      ) : (
        <div className="space-y-3">
          {campaigns.map((c) => {
            const Icon = CHANNEL_ICON[c.channel] ?? Mail;
            const total = c.total_recipients || 0;
            const handled = c.sent_count + c.failed_count;
            return (
              <Card key={c.id}>
                <CardContent className="pt-5">
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <Icon className="size-4 text-muted-foreground shrink-0" />
                        <h2 className="font-display font-bold truncate">{c.title}</h2>
                        <Badge variant="outline" className={cn("text-[10px]", STATUS_CLASS[c.status])}>
                          {t(`status_${c.status}`)}
                        </Badge>
                      </div>
                      {c.goal ? <p className="text-sm text-muted-foreground mt-0.5">{c.goal}</p> : null}
                      <p className="text-xs text-muted-foreground mt-1">
                        {t(`channel_${c.channel}`)}
                        {total > 0 ? ` · ${t("progress", { sent: c.sent_count, total })}` : ""}
                        {c.failed_count > 0 ? ` · ${t("failed", { count: c.failed_count })}` : ""}
                        {c.spent_credits > 0 ? ` · ${t("spent", { credits: c.spent_credits })}` : ""}
                        {c.scheduled_at ? ` · ${fmt(c.scheduled_at)}` : ""}
                      </p>
                      {total > 0 ? (
                        <div className="mt-2 h-1.5 w-full max-w-xs rounded-full bg-secondary overflow-hidden">
                          <div
                            className="h-full bg-primary transition-all"
                            style={{ width: `${Math.min(100, Math.round((handled / total) * 100))}%` }}
                          />
                        </div>
                      ) : null}
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {c.status === "draft" ? (
                        <Button size="sm" disabled={pending} onClick={() => act(approveBroadcastAction, c.id)}>
                          {pending ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
                          {t("approve")}
                        </Button>
                      ) : null}
                      {c.status === "approved" || c.status === "running" ? (
                        <Button size="sm" variant="outline" disabled={pending} onClick={() => act(pauseBroadcastAction, c.id)}>
                          <Pause className="size-3.5" />
                          {t("pause")}
                        </Button>
                      ) : null}
                      {c.status === "paused" ? (
                        <Button size="sm" variant="outline" disabled={pending} onClick={() => act(resumeBroadcastAction, c.id)}>
                          <Play className="size-3.5" />
                          {t("resume")}
                        </Button>
                      ) : null}
                      {c.status !== "done" && c.status !== "cancelled" ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={pending}
                          onClick={() => act(cancelBroadcastAction, c.id)}
                          className="text-muted-foreground hover:text-red-600"
                        >
                          <X className="size-3.5" />
                          {t("cancel")}
                        </Button>
                      ) : null}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <NewBroadcastDialog
        tenantId={tenantId}
        open={open}
        onOpenChange={setOpen}
        onCreated={() => {
          setOpen(false);
          router.refresh();
        }}
        fieldClass={FIELD_CLASS}
      />
    </div>
  );
}

function NewBroadcastDialog({
  tenantId,
  open,
  onOpenChange,
  onCreated,
  fieldClass,
}: {
  tenantId: string;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onCreated: () => void;
  fieldClass: string;
}) {
  const t = useTranslations("broadcasts");
  const tc = useTranslations("common");
  const [pending, startTransition] = useTransition();
  const [drafting, setDrafting] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [previewCount, setPreviewCount] = useState<number | null>(null);

  const [title, setTitle] = useState("");
  const [channel, setChannel] = useState<MarketingChannel>("email");
  const [source, setSource] = useState<Source>("customers");
  const [leadStatus, setLeadStatus] = useState("");
  const [vipOnly, setVipOnly] = useState(false);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [goal, setGoal] = useState("");
  const [budget, setBudget] = useState("");

  function audience() {
    return {
      source,
      lead_status: source !== "customers" && leadStatus.trim() ? leadStatus.trim() : null,
      vip_only: source !== "leads" ? vipOnly : false,
    };
  }

  async function preview() {
    setPreviewing(true);
    setPreviewCount(null);
    const res = await previewAudienceAction(tenantId, channel, audience());
    setPreviewing(false);
    if (res.ok) setPreviewCount(res.count ?? 0);
    else toast.error(res.error ?? tc("error"));
  }

  async function draft() {
    if (!goal.trim()) {
      toast.error(t("goal_required"));
      return;
    }
    setDrafting(true);
    const res = await draftBroadcastCopyAction(tenantId, { goal: goal.trim(), channel });
    setDrafting(false);
    if (!res.ok) {
      toast.error(res.error ?? tc("error"));
      return;
    }
    if (res.subject) setSubject(res.subject);
    if (res.body) setBody(res.body);
    toast.success(t("drafted"));
  }

  function create() {
    if (!title.trim() || !body.trim()) {
      toast.error(t("title_body_required"));
      return;
    }
    startTransition(async () => {
      const res = await createBroadcastAction(tenantId, {
        title: title.trim(),
        goal: goal.trim() || null,
        channel,
        subject: channel === "email" ? subject.trim() || null : null,
        body: body.trim(),
        audience: audience(),
        budget_credits: budget.trim() ? Math.max(0, Math.round(Number(budget))) : null,
        scheduled_at: null,
      });
      if (!res.ok) {
        toast.error(res.error ?? tc("error"));
        return;
      }
      toast.success(t("created"));
      // reset
      setTitle(""); setSubject(""); setBody(""); setGoal(""); setBudget("");
      setPreviewCount(null);
      onCreated();
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("new_title")}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Title */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium">{t("field_title")}</label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t("field_title_ph")} maxLength={200} />
          </div>

          {/* Channel */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium">{t("field_channel")}</label>
            <div className="grid grid-cols-3 gap-2">
              {(["email", "whatsapp", "sms"] as MarketingChannel[]).map((ch) => {
                const Icon = CHANNEL_ICON[ch];
                return (
                  <button
                    key={ch}
                    type="button"
                    onClick={() => { setChannel(ch); setPreviewCount(null); }}
                    className={cn(
                      "flex flex-col items-center gap-1 rounded-md border px-2 py-2.5 text-xs font-medium transition-colors",
                      channel === ch ? "border-primary bg-primary/10 text-primary" : "border-input hover:bg-accent",
                    )}
                  >
                    <Icon className="size-4" />
                    {t(`channel_${ch}`)}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Audience */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium flex items-center gap-1.5">
              <Users className="size-3.5" /> {t("field_audience")}
            </label>
            <select
              className={fieldClass}
              value={source}
              onChange={(e) => { setSource(e.target.value as Source); setPreviewCount(null); }}
            >
              <option value="customers">{t("source_customers")}</option>
              <option value="leads">{t("source_leads")}</option>
              <option value="both">{t("source_both")}</option>
            </select>
            <div className="flex flex-wrap items-center gap-3 pt-1">
              {source !== "leads" ? (
                <label className="flex items-center gap-1.5 text-sm text-muted-foreground">
                  <input type="checkbox" checked={vipOnly} onChange={(e) => { setVipOnly(e.target.checked); setPreviewCount(null); }} />
                  {t("vip_only")}
                </label>
              ) : null}
              {source !== "customers" ? (
                <input
                  className={cn(fieldClass, "h-9 w-40")}
                  value={leadStatus}
                  onChange={(e) => { setLeadStatus(e.target.value); setPreviewCount(null); }}
                  placeholder={t("lead_status_ph")}
                  maxLength={40}
                />
              ) : null}
              <Button type="button" size="sm" variant="outline" onClick={preview} disabled={previewing}>
                {previewing ? <Loader2 className="size-3.5 animate-spin" /> : <Users className="size-3.5" />}
                {t("preview")}
              </Button>
              {previewCount != null ? (
                <span className="text-sm font-medium text-primary">{t("recipients", { count: previewCount })}</span>
              ) : null}
            </div>
            {source !== "customers" ? (
              <p className="text-[11px] text-muted-foreground">{t("cold_note")}</p>
            ) : null}
          </div>

          {/* BOLIV draft */}
          <div className="rounded-md border border-dashed border-primary/40 bg-primary/5 p-3 space-y-2">
            <label className="text-sm font-medium flex items-center gap-1.5">
              <Sparkles className="size-3.5 text-primary" /> {t("draft_with_boliv")}
            </label>
            <textarea
              className={cn(fieldClass, "h-auto min-h-[60px]")}
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
              placeholder={t("goal_ph")}
              maxLength={2000}
            />
            <Button type="button" size="sm" variant="outline" onClick={draft} disabled={drafting}>
              {drafting ? <Loader2 className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5" />}
              {t("generate")}
            </Button>
          </div>

          {/* Subject (email only) */}
          {channel === "email" ? (
            <div className="space-y-1.5">
              <label className="text-sm font-medium">{t("field_subject")}</label>
              <Input value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={200} />
            </div>
          ) : null}

          {/* Body */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium">{t("field_body")}</label>
            <textarea
              className={cn(fieldClass, "h-auto min-h-[120px]")}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder={t("field_body_ph")}
              maxLength={5000}
            />
          </div>

          {/* Budget */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium">{t("field_budget")}</label>
            <Input
              type="number"
              min={0}
              value={budget}
              onChange={(e) => setBudget(e.target.value)}
              placeholder={t("field_budget_ph")}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={pending}>
            {t("cancel")}
          </Button>
          <Button onClick={create} disabled={pending}>
            {pending ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
            {t("create_draft")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
