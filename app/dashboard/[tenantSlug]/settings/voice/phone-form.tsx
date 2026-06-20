"use client";

import { useActionState, useEffect, useTransition } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Phone, Loader2, Unlink, ExternalLink, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  attachTwilioNumberAction,
  detachPhoneNumberAction,
  type VoiceActionState,
} from "@/lib/actions/voice";

const initial: VoiceActionState = { error: null };

export function PhoneAttachForm({
  tenantId,
}: {
  tenantId: string;
}) {
  const t = useTranslations("settings_voice");
  const [state, action, pending] = useActionState(attachTwilioNumberAction, initial);

  useEffect(() => {
    if (state.error) toast.error(state.error);
    if (state.success) toast.success(t("toast_number_connected"));
  }, [state, t]);

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="tenant_id" value={tenantId} />

      <div className="space-y-2">
        <Label htmlFor="phone_number">{t("field_twilio_number")}</Label>
        <Input
          id="phone_number"
          name="phone_number"
          placeholder="+15551234567"
          required
        />
        <p className="text-xs text-muted-foreground">
          {t.rich("twilio_number_hint", {
            link: (chunks) => (
              <a
                href="https://console.twilio.com/us1/develop/phone-numbers/manage/search"
                target="_blank"
                rel="noreferrer"
                className="underline hover:text-foreground inline-flex items-center gap-1"
              >
                {chunks}
                <ExternalLink className="size-3" />
              </a>
            ),
          })}
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="account_sid">Twilio Account SID</Label>
        <Input
          id="account_sid"
          name="account_sid"
          placeholder="ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
          required
          autoComplete="off"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="auth_token">Twilio Auth Token</Label>
        <Input
          id="auth_token"
          name="auth_token"
          type="password"
          placeholder="••••••••••••••••••••••••••••••••"
          required
          autoComplete="off"
        />
        <p className="text-xs text-muted-foreground inline-flex items-center gap-1">
          <ShieldCheck className="size-3" />
          {t("auth_token_hint_phone")}
        </p>
      </div>

      <Button type="submit" disabled={pending}>
        {pending ? (
          <Loader2 className="size-4 animate-spin" />
        ) : (
          <Phone className="size-4" />
        )}
        {pending ? t("connecting") : t("connect_number")}
      </Button>
    </form>
  );
}

export function PhoneDetachedView({
  tenantId,
  phoneNumber,
}: {
  tenantId: string;
  phoneNumber: string;
}) {
  const t = useTranslations("settings_voice");
  const [pending, start] = useTransition();

  function handleDetach() {
    if (!confirm(t("detach_confirm"))) return;
    start(async () => {
      const res = await detachPhoneNumberAction(tenantId);
      if (res.error) toast.error(res.error);
      else toast.success(t("toast_number_detached"));
    });
  }

  return (
    <Button
      type="button"
      variant="ghost"
      onClick={handleDetach}
      disabled={pending}
      className="text-muted-foreground hover:text-destructive"
    >
      {pending ? (
        <Loader2 className="size-4 animate-spin" />
      ) : (
        <Unlink className="size-4" />
      )}
      {t("detach_number", { number: phoneNumber })}
    </Button>
  );
}
