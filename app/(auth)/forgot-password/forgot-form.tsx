"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { forgotPasswordAction, type AuthState } from "@/lib/actions/auth";

const initial: AuthState = { error: null };

export function ForgotPasswordForm() {
  const t = useTranslations("auth");
  const [state, action, pending] = useActionState(forgotPasswordAction, initial);

  if (state.success) {
    return (
      <p className="text-sm text-muted-foreground">
        {t("forgot_success")}
      </p>
    );
  }

  return (
    <form action={action} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="email">{t("field_email")}</Label>
        <Input id="email" name="email" type="email" autoComplete="email" required />
      </div>

      {state.error ? (
        <p className="text-sm text-destructive" role="alert">
          {state.error}
        </p>
      ) : null}

      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? t("forgot_sending") : t("forgot_submit")}
      </Button>
    </form>
  );
}
