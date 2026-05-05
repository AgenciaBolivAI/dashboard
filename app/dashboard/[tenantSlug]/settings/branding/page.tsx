import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getTenantBySlug } from "@/lib/tenant";
import { BrandingForm } from "./branding-form";

export default async function BrandingPage({
  params,
}: {
  params: Promise<{ tenantSlug: string }>;
}) {
  const { tenantSlug } = await params;
  const tenant = await getTenantBySlug(tenantSlug);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Marca</CardTitle>
          <CardDescription>
            Personaliza el aspecto del panel de tu agente. Los colores se aplican en
            todos los acentos del dashboard.
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
