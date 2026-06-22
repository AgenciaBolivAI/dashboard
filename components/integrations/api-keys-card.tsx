"use client";

import { useState, useTransition } from "react";
import { useTranslations, useLocale } from "next-intl";
import { useRouter } from "next/navigation";
import { KeyRound, Copy, Trash2, Plus, Loader2, TriangleAlert, Check } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createApiKeyAction, revokeApiKeyAction, type ApiKeyRow } from "@/lib/actions/api-keys";

/**
 * Per-tenant API keys for the public REST API (Zapier / Make / partners). The
 * plaintext key is shown exactly ONCE, right after creation — never stored.
 */
export function ApiKeysCard({ tenantId, keys }: { tenantId: string; keys: ApiKeyRow[] }) {
  const t = useTranslations("settings_apikeys");
  const locale = useLocale();
  const router = useRouter();
  const [busy, start] = useTransition();
  const [name, setName] = useState("");
  const [fresh, setFresh] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  function generate() {
    start(async () => {
      const res = await createApiKeyAction(tenantId, name.trim() || undefined);
      if (res.error) { toast.error(res.error); return; }
      setFresh(res.plaintext ?? null);
      setName("");
      router.refresh();
    });
  }

  function revoke(id: string) {
    if (!confirm(t("revoke_confirm"))) return;
    start(async () => {
      const res = await revokeApiKeyAction(tenantId, id);
      if (res.error) { toast.error(res.error); return; }
      toast.success(t("revoked"));
      router.refresh();
    });
  }

  function copyFresh() {
    if (!fresh) return;
    navigator.clipboard.writeText(fresh);
    setCopied(true);
    toast.success(t("copied"));
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">{t("intro")}</p>

      {/* Freshly-created key — shown once */}
      {fresh ? (
        <div className="rounded-md border border-amber-500/40 bg-amber-500/5 p-3 space-y-2">
          <div className="flex items-center gap-2 text-sm font-medium text-amber-700 dark:text-amber-400">
            <TriangleAlert className="size-4 shrink-0" />
            {t("save_now")}
          </div>
          <div className="flex items-center gap-2">
            <Input value={fresh} readOnly className="font-mono text-xs" />
            <Button type="button" variant="outline" size="icon" onClick={copyFresh}>
              {copied ? <Check className="size-4 text-primary" /> : <Copy className="size-4" />}
            </Button>
          </div>
          <Button type="button" variant="ghost" size="sm" onClick={() => { setFresh(null); setCopied(false); }}>
            {t("dismiss")}
          </Button>
        </div>
      ) : null}

      {/* Generate */}
      <div className="flex flex-col sm:flex-row gap-2">
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t("name_placeholder")}
          maxLength={60}
        />
        <Button type="button" onClick={generate} disabled={busy} className="gap-1.5 shrink-0">
          {busy ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
          {t("generate")}
        </Button>
      </div>

      {/* Existing keys */}
      {keys.length > 0 ? (
        <div className="space-y-2">
          {keys.map((k) => (
            <div key={k.id} className="flex items-center justify-between gap-3 rounded-md border border-border bg-card px-3 py-2">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium truncate flex items-center gap-2">
                  <KeyRound className="size-3.5 text-muted-foreground shrink-0" />
                  {k.name}
                </p>
                <p className="text-xs text-muted-foreground font-mono">
                  {k.key_prefix}…{k.last_four}
                  {" · "}
                  {k.last_used_at
                    ? t("last_used", { date: new Date(k.last_used_at).toLocaleDateString(locale) })
                    : t("never_used")}
                </p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="text-muted-foreground hover:text-destructive shrink-0"
                onClick={() => revoke(k.id)}
                disabled={busy}
              >
                <Trash2 className="size-4" />
              </Button>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">{t("none")}</p>
      )}
    </div>
  );
}
