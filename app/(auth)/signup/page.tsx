import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { createServiceClient } from "@/lib/supabase/service";
import { OAuthButtons } from "@/components/auth/oauth-buttons";
import { SignUpForm } from "./signup-form";

export async function generateMetadata() {
  const t = await getTranslations("auth");
  return { title: t("signup_meta_title") };
}

export default async function SignUpPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  const t = await getTranslations("auth");

  // Invitation-only: without a valid token, show a dead-end "request invite" page.
  let invitation: { email: string; tenant_name: string } | null = null;
  if (token) {
    const svc = createServiceClient();
    const { data } = await svc
      .from("invitations")
      .select("email, accepted_at, expires_at, tenants(name)")
      .eq("token", token)
      .maybeSingle();

    if (data && !data.accepted_at && new Date(data.expires_at as string) > new Date()) {
      invitation = {
        email: data.email as string,
        tenant_name: (data.tenants as { name: string } | null)?.name ?? t("your_team_fallback"),
      };
    }
  }

  // If a valid invitation token is present, pre-fill + tell the user which
  // tenant they're joining. Otherwise show open self-serve sign-up.
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("signup_title")}</CardTitle>
        <CardDescription>
          {invitation
            ? t("signup_invited_description", { tenant: invitation.tenant_name })
            : t("signup_open_description")}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <SignUpForm
          invitationToken={token}
          prefilledEmail={invitation?.email}
        />
        {/* OAuth only for self-serve signup. Invited signups MUST use the
            password form so the invitation token attaches the tenant. */}
        {!token ? (
          <div className="mt-6">
            <OAuthButtons next="/onboarding" />
            <p className="mt-4 text-center text-xs leading-snug text-muted-foreground">
              {t.rich("terms_oauth_notice", {
                terms: (chunks) => (
                  <a
                    href="https://bolivai.com/terms.html"
                    target="_blank"
                    rel="noreferrer"
                    className="text-foreground underline underline-offset-2"
                  >
                    {chunks}
                  </a>
                ),
                privacy: (chunks) => (
                  <a
                    href="https://bolivai.com/privacy.html"
                    target="_blank"
                    rel="noreferrer"
                    className="text-foreground underline underline-offset-2"
                  >
                    {chunks}
                  </a>
                ),
              })}
            </p>
          </div>
        ) : null}
        <div className="mt-6 text-xs text-muted-foreground">
          {t("already_have_account")}{" "}
          <Link href="/login" className="text-foreground hover:underline">
            {t("sign_in_link")}
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}
