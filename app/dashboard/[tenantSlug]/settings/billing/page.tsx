import Link from "next/link";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ExternalLink, ShieldCheck, AlertTriangle, Zap, Globe } from "lucide-react";
import { getTenantBySlug } from "@/lib/tenant";
import { isConnectExpressSupported } from "@/lib/stripe";
import { getTranslations } from "next-intl/server";
import { BusinessProfileForm } from "./business-profile-form";
import { DisconnectStripeButton } from "./disconnect-stripe-button";

export default async function BillingSettingsPage({
  params,
  searchParams,
}: {
  params: Promise<{ tenantSlug: string }>;
  searchParams: Promise<{ connected?: string }>;
}) {
  const { tenantSlug } = await params;
  const { connected } = await searchParams;
  const tenant = await getTenantBySlug(tenantSlug);
  const countrySupported = isConnectExpressSupported(tenant.address_country);
  const t = await getTranslations("settings_billing");

  return (
    <div className="space-y-6">
      {connected === "1" ? (
        <Card className="border-primary/40 bg-primary/5">
          <CardContent className="pt-6">
            <p className="text-sm flex items-center gap-2">
              <ShieldCheck className="size-4 text-primary" />
              {t("stripe_connected_success")}
            </p>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            {t("stripe_payments_title")}
            {tenant.stripe_account_id ? (
              tenant.stripe_charges_enabled ? (
                <Badge variant="success">{t("badge_connected")}</Badge>
              ) : (
                <Badge variant="outline">{t("badge_pending_verification")}</Badge>
              )
            ) : (
              <Badge variant="outline">{t("badge_not_connected")}</Badge>
            )}
          </CardTitle>
          <CardDescription>
            {t("stripe_payments_description")}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {!tenant.stripe_account_id ? (
            <div className="space-y-3">
              {!countrySupported ? (
                <div className="flex items-start gap-2 text-xs bg-secondary/40 border border-border rounded-md p-3">
                  <Globe className="size-4 shrink-0 mt-0.5 text-muted-foreground" />
                  <div>
                    <p className="text-sm font-medium">
                      {t("country_not_supported_title", {
                        country: tenant.address_country ?? t("your_country"),
                      })}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {t("country_not_supported_description")}
                    </p>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  {t("stripe_onboarding_intro")}
                </p>
              )}
              <Button asChild disabled={!countrySupported}>
                <a
                  href={
                    countrySupported
                      ? `/api/stripe/connect/init?tenant_id=${tenant.id}`
                      : "#"
                  }
                  aria-disabled={!countrySupported}
                  className={!countrySupported ? "pointer-events-none opacity-50" : ""}
                >
                  <Zap className="size-4" />
                  {t("connect_stripe_button")}
                </a>
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              <dl className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
                <DlField label={t("field_stripe_account")} value={tenant.stripe_account_id} mono />
                <DlField label={t("field_country")} value={tenant.stripe_account_country ?? "—"} />
                <DlField
                  label={t("field_status")}
                  value={
                    tenant.stripe_charges_enabled && tenant.stripe_payouts_enabled
                      ? t("status_ready")
                      : t("status_pending_verification")
                  }
                />
              </dl>

              {!tenant.stripe_charges_enabled ? (
                <div className="flex items-start gap-2 text-xs text-muted-foreground bg-secondary/40 border border-border rounded-md p-3">
                  <AlertTriangle className="size-4 shrink-0 mt-0.5" />
                  <span>
                    {t("stripe_needs_more_info")}
                  </span>
                </div>
              ) : null}

              <div className="flex gap-2 flex-wrap">
                {tenant.stripe_charges_enabled ? (
                  // Ready → open their Express dashboard via a platform login link.
                  <Button asChild variant="outline">
                    <a href={`/api/stripe/connect/dashboard?tenant_id=${tenant.id}`}>
                      <ExternalLink className="size-4" />
                      {t("open_stripe_button")}
                    </a>
                  </Button>
                ) : (
                  // Still onboarding / under review → send them back to finish it
                  // (reuses the existing account, just mints a fresh link).
                  <Button asChild>
                    <a href={`/api/stripe/connect/init?tenant_id=${tenant.id}`}>
                      <Zap className="size-4" />
                      {t("continue_onboarding_button")}
                    </a>
                  </Button>
                )}
                <DisconnectStripeButton tenantId={tenant.id} />
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("business_data_title")}</CardTitle>
          <CardDescription>
            {t("business_data_description")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <BusinessProfileForm
            tenant={{
              id: tenant.id,
              legal_name: tenant.legal_name,
              tax_id: tenant.tax_id,
              address_line1: tenant.address_line1,
              address_line2: tenant.address_line2,
              address_city: tenant.address_city,
              address_state: tenant.address_state,
              address_postal_code: tenant.address_postal_code,
              address_country: tenant.address_country,
              invoice_footer: tenant.invoice_footer,
              invoice_default_currency: tenant.invoice_default_currency,
            }}
          />
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">
        {t.rich("billing_help_text", {
          link: (chunks) => (
            <Link
              href="https://stripe.com/docs/connect/express-accounts"
              target="_blank"
              rel="noreferrer"
              className="underline hover:text-foreground"
            >
              {chunks}
            </Link>
          ),
        })}
      </p>
    </div>
  );
}

function DlField({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className={mono ? "font-mono text-xs break-all" : ""}>{value}</dd>
    </div>
  );
}
