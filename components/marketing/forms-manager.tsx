"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  Plus, Copy, ExternalLink, Pencil, Trash2, Power, FileInput, Check, Loader2,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  createLeadFormAction, updateLeadFormAction, toggleLeadFormAction, deleteLeadFormAction,
} from "@/lib/actions/forms";
import type { LeadFormRow, LeadFormField } from "@/lib/queries/marketing";
import { cn } from "@/lib/utils";

const FIELD_CLASS =
  "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2";

const FIELD_DEFS: { key: LeadFormField["key"]; type: LeadFormField["type"] }[] = [
  { key: "name", type: "text" },
  { key: "email", type: "email" },
  { key: "phone", type: "tel" },
  { key: "message", type: "textarea" },
];

export function FormsManager({
  tenantId,
  forms,
  appUrl,
}: {
  tenantId: string;
  forms: LeadFormRow[];
  appUrl: string;
}) {
  const t = useTranslations("lead_forms");
  const tc = useTranslations("common");
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [editing, setEditing] = useState<LeadFormRow | null>(null);
  const [creating, setCreating] = useState(false);

  function publicUrl(slug: string) {
    return `${appUrl.replace(/\/+$/, "")}/f/${slug}`;
  }

  async function copyLink(slug: string) {
    try {
      await navigator.clipboard.writeText(publicUrl(slug));
      toast.success(t("link_copied"));
    } catch {
      toast.error(tc("error"));
    }
  }

  function toggle(f: LeadFormRow) {
    startTransition(async () => {
      const res = await toggleLeadFormAction(tenantId, f.id, f.status === "active" ? "disabled" : "active");
      if (!res.ok) toast.error(res.error ?? tc("error"));
      else router.refresh();
    });
  }

  function remove(f: LeadFormRow) {
    if (!window.confirm(t("delete_confirm"))) return;
    startTransition(async () => {
      const res = await deleteLeadFormAction(tenantId, f.id);
      if (!res.ok) toast.error(res.error ?? tc("error"));
      else router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={() => setCreating(true)}>
          <Plus className="size-4" />
          {t("new")}
        </Button>
      </div>

      {forms.length === 0 ? (
        <Card className="py-16 flex flex-col items-center text-center">
          <FileInput className="size-10 text-muted-foreground mb-4" />
          <p className="font-medium">{t("empty_title")}</p>
          <p className="text-sm text-muted-foreground mt-1 max-w-md">{t("empty_subtitle")}</p>
        </Card>
      ) : (
        <div className="space-y-3">
          {forms.map((f) => (
            <Card key={f.id}>
              <CardContent className="pt-5">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <h2 className="font-display font-bold truncate">{f.title}</h2>
                      <Badge
                        variant="outline"
                        className={cn(
                          "text-[10px]",
                          f.status === "active"
                            ? "bg-green-500/10 text-green-600 border-green-500/30"
                            : "bg-slate-500/10 text-slate-500 border-slate-500/30",
                        )}
                      >
                        {t(`status_${f.status}`)}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      {t("submissions", { count: f.submit_count })}
                    </p>
                    <div className="mt-2 flex items-center gap-2">
                      <code className="truncate rounded bg-secondary px-2 py-1 text-xs text-muted-foreground max-w-[260px]">
                        {publicUrl(f.slug)}
                      </code>
                      <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => copyLink(f.slug)}>
                        <Copy className="size-3.5" />
                      </Button>
                      <a href={publicUrl(f.slug)} target="_blank" rel="noopener noreferrer">
                        <Button size="sm" variant="ghost" className="h-7 px-2">
                          <ExternalLink className="size-3.5" />
                        </Button>
                      </a>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <Button size="sm" variant="outline" disabled={pending} onClick={() => setEditing(f)}>
                      <Pencil className="size-3.5" />
                      {t("edit")}
                    </Button>
                    <Button size="sm" variant="ghost" disabled={pending} onClick={() => toggle(f)}>
                      <Power className="size-3.5" />
                      {f.status === "active" ? t("disable") : t("enable")}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={pending}
                      onClick={() => remove(f)}
                      className="text-muted-foreground hover:text-red-600"
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {(creating || editing) && (
        <FormBuilderDialog
          tenantId={tenantId}
          existing={editing}
          open={creating || !!editing}
          onOpenChange={(o) => {
            if (!o) {
              setCreating(false);
              setEditing(null);
            }
          }}
          onSaved={() => {
            setCreating(false);
            setEditing(null);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

function defaultFields(t: (k: string) => string): LeadFormField[] {
  return FIELD_DEFS.map((d) => ({
    key: d.key,
    type: d.type,
    label: t(`field_${d.key}`),
    enabled: d.key !== "message",
    required: d.key === "email",
  }));
}

function FormBuilderDialog({
  tenantId,
  existing,
  open,
  onOpenChange,
  onSaved,
}: {
  tenantId: string;
  existing: LeadFormRow | null;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onSaved: () => void;
}) {
  const t = useTranslations("lead_forms");
  const tc = useTranslations("common");
  const [pending, startTransition] = useTransition();

  const [title, setTitle] = useState(existing?.title ?? "");
  const [description, setDescription] = useState(existing?.description ?? "");
  const [successMessage, setSuccessMessage] = useState(existing?.success_message ?? "");
  const [redirectUrl, setRedirectUrl] = useState(existing?.redirect_url ?? "");
  const [fields, setFields] = useState<LeadFormField[]>(() => {
    if (existing?.fields?.length) {
      // Merge stored config over the canonical field set (keeps order + new keys).
      return FIELD_DEFS.map((d) => {
        const stored = existing.fields.find((f) => f.key === d.key);
        return (
          stored ?? {
            key: d.key,
            type: d.type,
            label: t(`field_${d.key}`),
            enabled: false,
            required: false,
          }
        );
      });
    }
    return defaultFields(t);
  });

  function setField(key: string, patch: Partial<LeadFormField>) {
    setFields((prev) => prev.map((f) => (f.key === key ? { ...f, ...patch } : f)));
  }

  function save() {
    if (!title.trim()) {
      toast.error(t("title_required"));
      return;
    }
    const payload = {
      title: title.trim(),
      description: description.trim() || null,
      fields,
      success_message: successMessage.trim() || null,
      redirect_url: redirectUrl.trim() || null,
    };
    startTransition(async () => {
      const res = existing
        ? await updateLeadFormAction(tenantId, existing.id, payload)
        : await createLeadFormAction(tenantId, payload);
      if (!res.ok) {
        toast.error(res.error ?? tc("error"));
        return;
      }
      toast.success(existing ? t("saved") : t("created"));
      onSaved();
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{existing ? t("edit_title") : t("new_title")}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <label className="text-sm font-medium">{t("field_form_title")}</label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t("form_title_ph")} maxLength={120} />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">{t("field_description")}</label>
            <textarea
              className={cn(FIELD_CLASS, "h-auto min-h-[60px]")}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={600}
            />
          </div>

          {/* Field toggles */}
          <div className="space-y-2">
            <label className="text-sm font-medium">{t("fields_title")}</label>
            <div className="space-y-2 rounded-md border border-border p-3">
              {fields.map((f) => (
                <div key={f.key} className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={f.enabled}
                    onChange={(e) => setField(f.key, { enabled: e.target.checked })}
                  />
                  <Input
                    value={f.label}
                    onChange={(e) => setField(f.key, { label: e.target.value })}
                    className="h-8 flex-1"
                    maxLength={60}
                  />
                  <label className="flex items-center gap-1 text-xs text-muted-foreground whitespace-nowrap">
                    <input
                      type="checkbox"
                      checked={f.required}
                      disabled={!f.enabled}
                      onChange={(e) => setField(f.key, { required: e.target.checked })}
                    />
                    {t("required")}
                  </label>
                </div>
              ))}
            </div>
            <p className="text-[11px] text-muted-foreground">{t("contact_note")}</p>
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium">{t("field_success")}</label>
            <Input value={successMessage} onChange={(e) => setSuccessMessage(e.target.value)} placeholder={t("success_ph")} maxLength={400} />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">{t("field_redirect")}</label>
            <Input value={redirectUrl} onChange={(e) => setRedirectUrl(e.target.value)} placeholder="https://…" maxLength={500} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={pending}>
            {t("cancel")}
          </Button>
          <Button onClick={save} disabled={pending}>
            {pending ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
            {existing ? t("save") : t("create")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
