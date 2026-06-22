"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { Mail, CheckCircle2, Trash2, Save, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { saveSmtpConfigAction, removeSmtpConfigAction } from "@/lib/actions/email-settings";

type Status = {
  active: "gmail" | "smtp" | null;
  gmailEmail: string | null;
  smtp: { host: string; port: number; secure: boolean; user: string; fromEmail: string; fromName: string | null } | null;
};

/**
 * Lets a tenant configure the email BOLIV sends FROM. Gmail (via the Google
 * connection) takes priority and needs no setup here; otherwise a tenant can
 * plug in their own SMTP. info@bolivai.com is never an option (platform-only).
 */
export function EmailSenderCard({ tenantId, status }: { tenantId: string; status: Status }) {
  const t = useTranslations("settings_email");
  const router = useRouter();
  const [saving, startSave] = useTransition();
  const [showForm, setShowForm] = useState(!status.gmailEmail && !status.smtp);
  const [host, setHost] = useState(status.smtp?.host ?? "");
  const [port, setPort] = useState(String(status.smtp?.port ?? 587));
  const [user, setUser] = useState(status.smtp?.user ?? "");
  const [pass, setPass] = useState("");
  const [fromEmail, setFromEmail] = useState(status.smtp?.fromEmail ?? "");
  const [fromName, setFromName] = useState(status.smtp?.fromName ?? "");

  function save() {
    startSave(async () => {
      const res = await saveSmtpConfigAction(tenantId, {
        host: host.trim(),
        port: Number(port),
        secure: Number(port) === 465,
        user: user.trim(),
        pass,
        from_email: fromEmail.trim(),
        from_name: fromName.trim() || null,
      });
      if (res.error) {
        toast.error(res.error);
        return;
      }
      toast.success(t("smtp_saved"));
      setPass("");
      setShowForm(false);
      router.refresh();
    });
  }

  function remove() {
    if (!confirm(t("smtp_remove_confirm"))) return;
    startSave(async () => {
      const res = await removeSmtpConfigAction(tenantId);
      if (res.error) {
        toast.error(res.error);
        return;
      }
      toast.success(t("smtp_removed"));
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      {/* Active sender summary */}
      {status.gmailEmail ? (
        <div className="flex items-center justify-between gap-3 rounded-md border border-primary/30 bg-primary/5 p-3">
          <div className="flex items-center gap-2 min-w-0">
            <CheckCircle2 className="size-4 text-primary shrink-0" />
            <div className="min-w-0">
              <p className="text-sm font-medium truncate">{t("gmail_active")}</p>
              <p className="text-xs text-muted-foreground truncate">{status.gmailEmail}</p>
            </div>
          </div>
          <Badge variant="success">{t("active_badge")}</Badge>
        </div>
      ) : status.smtp ? (
        <div className="flex items-center justify-between gap-3 rounded-md border border-primary/30 bg-primary/5 p-3">
          <div className="flex items-center gap-2 min-w-0">
            <Mail className="size-4 text-primary shrink-0" />
            <div className="min-w-0">
              <p className="text-sm font-medium truncate">{status.smtp.fromEmail}</p>
              <p className="text-xs text-muted-foreground truncate">{t("smtp_via", { host: status.smtp.host })}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Badge variant="success">{t("active_badge")}</Badge>
            <Button variant="ghost" size="icon" onClick={remove} disabled={saving} className="text-muted-foreground hover:text-destructive">
              <Trash2 className="size-4" />
            </Button>
          </div>
        </div>
      ) : (
        <div className="rounded-md border border-amber-500/40 bg-amber-500/5 p-3 text-sm">
          <p className="font-medium">{t("none_title")}</p>
          <p className="mt-1 text-xs text-muted-foreground">{t("none_hint")}</p>
        </div>
      )}

      {/* SMTP form */}
      {showForm ? (
        <div className="space-y-3 rounded-md border border-border p-3">
          <p className="text-sm font-medium">{t("smtp_title")}</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label={t("smtp_host")} value={host} onChange={setHost} placeholder="smtp.tudominio.com" />
            <Field label={t("smtp_port")} value={port} onChange={setPort} placeholder="587" type="number" />
            <Field label={t("smtp_user")} value={user} onChange={setUser} placeholder="correo@tudominio.com" />
            <Field label={t("smtp_pass")} value={pass} onChange={setPass} placeholder="••••••••" type="password" />
            <Field label={t("smtp_from_email")} value={fromEmail} onChange={setFromEmail} placeholder="correo@tudominio.com" />
            <Field label={t("smtp_from_name")} value={fromName} onChange={setFromName} placeholder={t("smtp_from_name_ph")} />
          </div>
          <div className="flex gap-2">
            <Button size="sm" onClick={save} disabled={saving} className="gap-1.5">
              {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
              {t("smtp_save")}
            </Button>
            {status.smtp || status.gmailEmail ? (
              <Button size="sm" variant="ghost" onClick={() => setShowForm(false)}>{t("cancel")}</Button>
            ) : null}
          </div>
        </div>
      ) : (
        <Button size="sm" variant="outline" onClick={() => setShowForm(true)}>
          {status.smtp ? t("smtp_edit") : t("smtp_add")}
        </Button>
      )}
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  type,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      <Input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} type={type} />
    </div>
  );
}
