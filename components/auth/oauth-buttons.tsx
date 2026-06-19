"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";

/**
 * Native Supabase social login (Google + Facebook). Runs entirely client-side:
 * `signInWithOAuth` redirects the browser to the provider, which returns to
 * `/auth/callback?next=...` where the session is exchanged + the user is routed
 * (new users → /onboarding). Provider credentials live in the Supabase project
 * settings, NOT in app env vars.
 *
 * Shown on login and on SELF-SERVE signup only — never on invited signup, where
 * the invitation token must flow through the password form to attach the tenant.
 */
export function OAuthButtons({ next }: { next?: string }) {
  const t = useTranslations("auth");
  const [loading, setLoading] = useState<null | "google" | "facebook">(null);
  const [error, setError] = useState<string | null>(null);

  async function signIn(provider: "google" | "facebook") {
    setError(null);
    setLoading(provider);
    const supabase = createClient();
    const params = new URLSearchParams();
    if (next) params.set("next", next);
    const qs = params.toString();
    const redirectTo = `${window.location.origin}/auth/callback${qs ? `?${qs}` : ""}`;

    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo },
    });

    // On success the browser is already navigating to the provider — leave the
    // spinner up. Only surface an error if the call itself failed.
    if (error) {
      setError(t("oauth_error"));
      setLoading(null);
    }
  }

  return (
    <div className="space-y-3">
      <div className="relative flex items-center" aria-hidden="true">
        <span className="grow border-t border-border" />
        <span className="mx-3 text-xs uppercase tracking-wider text-muted-foreground">
          {t("oauth_divider")}
        </span>
        <span className="grow border-t border-border" />
      </div>

      <div className="grid gap-2">
        <Button
          type="button"
          variant="outline"
          className="w-full"
          disabled={loading !== null}
          onClick={() => signIn("google")}
        >
          <GoogleIcon />
          {t("oauth_google")}
        </Button>
        <Button
          type="button"
          variant="outline"
          className="w-full"
          disabled={loading !== null}
          onClick={() => signIn("facebook")}
        >
          <FacebookIcon />
          {t("oauth_facebook")}
        </Button>
      </div>

      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true">
      <path
        fill="#FFC107"
        d="M43.611 20.083H42V20H24v8h11.303c-1.649 4.657-6.08 8-11.303 8-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 12.955 4 4 12.955 4 24s8.955 20 20 20 20-8.955 20-20c0-1.341-.138-2.65-.389-3.917z"
      />
      <path
        fill="#FF3D00"
        d="M6.306 14.691l6.571 4.819C14.655 15.108 18.961 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 16.318 4 9.656 8.337 6.306 14.691z"
      />
      <path
        fill="#4CAF50"
        d="M24 44c5.166 0 9.86-1.977 13.409-5.192l-6.19-5.238C29.211 35.091 26.715 36 24 36c-5.202 0-9.619-3.317-11.283-7.946l-6.522 5.025C9.505 39.556 16.227 44 24 44z"
      />
      <path
        fill="#1976D2"
        d="M43.611 20.083H42V20H24v8h11.303a12.04 12.04 0 0 1-4.087 5.571l.003-.002 6.19 5.238C36.971 39.205 44 34 44 24c0-1.341-.138-2.65-.389-3.917z"
      />
    </svg>
  );
}

function FacebookIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#1877F2"
        d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"
      />
    </svg>
  );
}
