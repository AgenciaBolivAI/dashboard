import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { getTenantBySlug } from "@/lib/tenant";
import { GeneralForm } from "./general-form";

export default async function GeneralSettingsPage({
  params,
}: {
  params: Promise<{ tenantSlug: string }>;
}) {
  const { tenantSlug } = await params;
  const tenant = await getTenantBySlug(tenantSlug);

  return (
    <Card>
      <CardHeader>
        <CardTitle>General</CardTitle>
        <CardDescription>
          Datos básicos del agente: nombre del negocio, idioma, zona horaria, contacto.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <GeneralForm
          tenant={{
            id: tenant.id,
            name: tenant.name,
            industry: tenant.industry,
            language: tenant.language,
            timezone: tenant.timezone,
            whatsapp_number: tenant.whatsapp_number,
            support_email: tenant.support_email,
            support_whatsapp: tenant.support_whatsapp,
            notification_email: tenant.notification_email,
            notification_whatsapp_e164: tenant.notification_whatsapp_e164,
            notify_on_new_reservation: tenant.notify_on_new_reservation,
            notify_on_reschedule: tenant.notify_on_reschedule,
            notify_on_cancel: tenant.notify_on_cancel,
          }}
        />
      </CardContent>
    </Card>
  );
}
