"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { resetPasswordAction, type AuthState } from "@/lib/actions/auth";

const initial: AuthState = { error: null };

export function ResetPasswordForm() {
  const t = useTranslations("auth");
  const [state, action, pending] = useActionState(resetPasswordAction, initial);

  return (
    <form action={action} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="password">{t("field_new_password")}</Label>
        <Input id="password" name="password" type="password" autoComplete="new-password" minLength={8} required />
      </div>

      <div className="space-y-2">
        <Label htmlFor="confirm">{t("field_confirm_short")}</Label>
        <Input id="confirm" name="confirm" type="password" autoComplete="new-password" required />
      </div>

      {state.error ? (
        <p className="text-sm text-destructive" role="alert">
          {state.error}
        </p>
      ) : null}

      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? t("saving_password") : t("save_password")}
      </Button>
    </form>
  );
}
