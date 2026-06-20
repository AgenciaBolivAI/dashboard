"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  Loader2, ExternalLink, Phone, CheckCircle2, AlertCircle, X,
} from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  attachTwilioNumberAction,
  detachPhoneNumberAction,
  type VoiceActionState,
} from "@/lib/actions/voice";

const initial: VoiceActionState = { error: null };

/**
 * Twilio setup wizard for tenants who want voice. We don't sell phone
 * numbers (yet) — tenants bring their own Twilio account + number, pay
 * Twilio directly for the carrier costs, and BolivAI handles the AI
 * agents + per-minute Conversational AI cost via the credit ledger.
 *
 * Two modes:
 *  - Not connected → 3-step guided form
 *  - Connected     → status + Disconnect button
 */
export function TwilioSetupWizard({
  tenantId,
  current,
}: {
  tenantId: string;
  current: {
    phone_number: string | null;
    provider: string | null;
  };
}) {
  const router = useRouter();
  const t = useTranslations("settings_voice");
  const [state, action, pending] = useActionState(attachTwilioNumberAction, initial);
  const [showAuth, setShowAuth] = useState(false);
  const [detaching, startDetach] = useTransition();

  useEffect(() => {
    if (state.error) toast.error(state.error);
    if (state.success) {
      toast.success(t("twilio_connected_toast"));
      router.refresh();
    }
  }, [state, router, t]);

  function disconnect() {
    if (!confirm(t("twilio_disconnect_confirm"))) return;
    startDetach(async () => {
      const res = await detachPhoneNumberAction(tenantId);
      if (res.error) {
        toast.error(res.error);
        return;
      }
      toast.success(t("twilio_disconnected_toast"));
      router.refresh();
    });
  }

  // ────────── Connected state ──────────
  if (current.phone_number) {
    return (
      <Card className="p-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-start gap-3">
            <div className="rounded-full bg-emerald-500/10 p-2">
              <CheckCircle2 className="size-5 text-emerald-600" />
            </div>
            <div>
              <p className="font-semibold flex items-center gap-2">
                {t("number_connected_title")}
                <Badge variant="success" className="text-[10px]">{t("badge_active_lower")}</Badge>
              </p>
              <p className="text-sm text-muted-foreground mt-0.5 font-mono">
                {current.phone_number}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                {t("number_connected_note")}
              </p>
            </div>
          </div>
          <Button
            variant="outline"
            onClick={disconnect}
            disabled={detaching}
            className="text-destructive hover:bg-destructive/10"
          >
            {detaching ? <Loader2 className="size-4 animate-spin" /> : <X className="size-4" />}
            {t("disconnect")}
          </Button>
        </div>
      </Card>
    );
  }

  // ────────── Setup wizard ──────────
  return (
    <Card className="p-6">
      <div className="mb-5">
        <p className="font-semibold flex items-center gap-2">
          <Phone className="size-4 text-primary" />
          {t("wizard_title")}
        </p>
        <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
          {t("wizard_intro")}
        </p>
      </div>

      {/* Step indicators + Twilio prep */}
      <ol className="space-y-3 mb-6 text-sm">
        <Step
          number={1}
          title={t("step1_title")}
          body={
            <span>
              {t.rich("step1_body", {
                link: (chunks) => (
                  <a
                    href="https://www.twilio.com/try-twilio"
                    target="_blank"
                    rel="noopener"
                    className="text-primary hover:underline inline-flex items-center gap-1"
                  >
                    {chunks} <ExternalLink className="size-3" />
                  </a>
                ),
              })}
            </span>
          }
        />
        <Step
          number={2}
          title={t("step2_title")}
          body={
            <span>
              {t.rich("step2_body", {
                link: (chunks) => (
                  <a
                    href="https://console.twilio.com/us1/develop/phone-numbers/manage/search"
                    target="_blank"
                    rel="noopener"
                    className="text-primary hover:underline inline-flex items-center gap-1"
                  >
                    {chunks} <ExternalLink className="size-3" />
                  </a>
                ),
                strong: (chunks) => <strong>{chunks}</strong>,
              })}
            </span>
          }
        />
        <Step
          number={3}
          title={t("step3_title")}
          body={
            <span>
              {t.rich("step3_body", {
                strong: (chunks) => <strong>{chunks}</strong>,
                code: (chunks) => (
                  <code className="text-xs bg-muted px-1 rounded">{chunks}</code>
                ),
              })}
            </span>
          }
        />
      </ol>

      {/* The actual form */}
      <form action={action} className="space-y-4 border-t border-border pt-5">
        <input type="hidden" name="tenant_id" value={tenantId} />

        <div className="space-y-1.5">
          <Label htmlFor="phone_number" className="text-xs">
            {t("field_phone_number")}
          </Label>
          <Input
            id="phone_number"
            name="phone_number"
            type="tel"
            placeholder="+18888690795"
            required
            className="font-mono"
          />
          <p className="text-[11px] text-muted-foreground">
            {t("field_phone_number_hint")}
          </p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="account_sid" className="text-xs">
            Twilio Account SID
          </Label>
          <Input
            id="account_sid"
            name="account_sid"
            placeholder="AC..."
            required
            className="font-mono"
            autoComplete="off"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="auth_token" className="text-xs">
            Twilio Auth Token
          </Label>
          <div className="relative">
            <Input
              id="auth_token"
              name="auth_token"
              type={showAuth ? "text" : "password"}
              placeholder="••••••••••••••••••••••••••••••••"
              required
              className="font-mono pr-16"
              autoComplete="off"
            />
            <button
              type="button"
              onClick={() => setShowAuth((v) => !v)}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground hover:text-foreground"
            >
              {showAuth ? t("toggle_hide") : t("toggle_show")}
            </button>
          </div>
          <p className="text-[11px] text-muted-foreground">
            {t("auth_token_hint")}
          </p>
        </div>

        {state.error ? (
          <div className="flex items-start gap-2 text-sm text-destructive bg-destructive/10 border border-destructive/30 rounded-md p-3">
            <AlertCircle className="size-4 shrink-0 mt-0.5" />
            <span>{state.error}</span>
          </div>
        ) : null}

        <Button type="submit" disabled={pending} className="w-full">
          {pending ? (
            <>
              <Loader2 className="size-4 animate-spin" />
              {t("connecting")}
            </>
          ) : (
            <>
              <Phone className="size-4" />
              {t("connect_number")}
            </>
          )}
        </Button>
      </form>
    </Card>
  );
}

function Step({
  number,
  title,
  body,
}: {
  number: number;
  title: string;
  body: React.ReactNode;
}) {
  return (
    <li className="flex gap-3">
      <span className="shrink-0 inline-flex items-center justify-center size-6 rounded-full bg-primary/10 text-primary text-xs font-semibold">
        {number}
      </span>
      <div>
        <p className="font-medium">{title}</p>
        <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
          {body}
        </p>
      </div>
    </li>
  );
}
