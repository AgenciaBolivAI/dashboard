"use client";

import { useActionState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { signUpAction, type AuthState } from "@/lib/actions/auth";
import { TERMS_URL, PRIVACY_URL } from "@/lib/legal";

const initial: AuthState = { error: null };

export function SignUpForm({
  invitationToken,
  prefilledEmail,
}: {
  invitationToken?: string;
  prefilledEmail?: string;
}) {
  const t = useTranslations("auth");
  const [state, action, pending] = useActionState(signUpAction, initial);

  // Success path normally redirects server-side (signUpAction → redirect).
  // This block only fires if the auto-sign-in failed but the account was created.
  if (state.success) {
    return (
      <div className="space-y-4 text-sm">
        <p className="font-medium text-foreground">{t("account_created_title")}</p>
        <p className="text-muted-foreground">{t("account_created_desc")}</p>
        <Button asChild className="w-full">
          <Link href="/login?next=/onboarding">{t("sign_in_cta")}</Link>
        </Button>
      </div>
    );
  }

  return (
    <form action={action} className="space-y-4">
      {invitationToken ? (
        <input type="hidden" name="invitation_token" value={invitationToken} />
      ) : null}

      <div className="space-y-2">
        <Label htmlFor="email">{t("field_email")}</Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          defaultValue={prefilledEmail}
          readOnly={!!prefilledEmail}
          required
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="password">{t("field_password")}</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          minLength={8}
          required
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="confirm">{t("field_confirm")}</Label>
        <Input id="confirm" name="confirm" type="password" autoComplete="new-password" required />
      </div>

      <div className="flex items-start gap-2">
        <input
          id="accept_terms"
          name="accept_terms"
          type="checkbox"
          required
          className="mt-0.5 size-4 shrink-0 cursor-pointer rounded border-input accent-primary"
        />
        <Label htmlFor="accept_terms" className="text-sm font-normal leading-snug text-muted-foreground">
          {t.rich("terms_accept", {
            terms: (chunks) => (
              <a
                href={TERMS_URL}
                target="_blank"
                rel="noreferrer"
                className="text-primary underline underline-offset-2"
              >
                {chunks}
              </a>
            ),
            privacy: (chunks) => (
              <a
                href={PRIVACY_URL}
                target="_blank"
                rel="noreferrer"
                className="text-primary underline underline-offset-2"
              >
                {chunks}
              </a>
            ),
          })}
        </Label>
      </div>

      {state.error ? (
        <p className="text-sm text-destructive" role="alert">
          {state.error}
        </p>
      ) : null}

      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? t("creating_account") : t("create_account")}
      </Button>
    </form>
  );
}
