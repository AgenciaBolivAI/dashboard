import Link from "next/link";
import { ArrowLeft, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { getTenantBySlug } from "@/lib/tenant";
import { requireUser, requireTenantAccess } from "@/lib/auth";
import { getCcavaiSettings } from "@/lib/queries/ccavai";
import { CcavaiSettingsForm } from "@/components/ccavai/ccavai-settings-form";

export const dynamic = "force-dynamic";

export default async function CcavaiSettingsPage({
  params,
}: {
  params: Promise<{ tenantSlug: string }>;
}) {
  const { tenantSlug } = await params;
  const tenant = await getTenantBySlug(tenantSlug);
  await requireUser();
  await requireTenantAccess(tenant.id, { minRole: "admin" });

  const settings = await getCcavaiSettings(tenant.id);

  if (!settings) {
    return (
      <div className="p-6 md:p-8 max-w-3xl">
        <h1 className="text-3xl font-display font-extrabold tracking-tight">
          CCAVAI · Ajustes
        </h1>
        <Card className="p-6 mt-4">
          <p className="text-sm text-muted-foreground">
            Estamos inicializando tus ajustes de CCAVAI. Recarga la página en unos
            segundos.
          </p>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 md:p-8 max-w-4xl">
      <Button asChild variant="ghost" size="sm" className="mb-4">
        <Link href={`/dashboard/${tenantSlug}/content`}>
          <ArrowLeft className="size-4" />
          Volver al contenido
        </Link>
      </Button>

      <div className="mb-6">
        <h1 className="text-3xl font-display font-extrabold tracking-tight flex items-center gap-2">
          <Wand2 className="size-7 text-purple-500" />
          Ajustes de CCAVAI
        </h1>
        <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
          Configura cómo CCAVAI genera contenido para tu marca: qué fuentes RSS
          monitorear, qué plataformas alimentar, qué tono usar, qué decir y qué
          evitar.
        </p>
      </div>

      <CcavaiSettingsForm tenantId={tenant.id} settings={settings} />
    </div>
  );
}
