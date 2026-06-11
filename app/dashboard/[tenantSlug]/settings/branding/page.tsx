import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getTenantBySlug } from "@/lib/tenant";
import { getTranslations } from "next-intl/server";
import { BrandingForm } from "./branding-form";

export default async function BrandingPage({
  params,
}: {
  params: Promise<{ tenantSlug: string }>;
}) {
  const { tenantSlug } = await params;
  const tenant = await getTenantBySlug(tenantSlug);
  const t = await getTranslations("settings_branding");

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>{t("title")}</CardTitle>
          <CardDescription>
            {t("description")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <BrandingForm
            tenant={{
              id: tenant.id,
              logo_url: tenant.logo_url,
              primary_color: tenant.primary_color,
              accent_color: tenant.accent_color,
              custom_domain: tenant.custom_domain,
            }}
          />
        </CardContent>
      </Card>
    </div>
  );
}
