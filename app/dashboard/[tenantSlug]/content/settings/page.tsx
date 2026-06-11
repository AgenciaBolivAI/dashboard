import Link from "next/link";
import { ArrowLeft, Wand2 } from "lucide-react";
import { getTranslations } from "next-intl/server";
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
  const t = await getTranslations("content");

  const settings = await getCcavaiSettings(tenant.id);

  if (!settings) {
    return (
      <div className="p-6 md:p-8 max-w-3xl">
        <h1 className="text-3xl font-display font-extrabold tracking-tight">
          {t("settings_pending_title")}
        </h1>
        <Card className="p-6 mt-4">
          <p className="text-sm text-muted-foreground">
            {t("settings_pending_body")}
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
          {t("back_to_content")}
        </Link>
      </Button>

      <div className="mb-6">
        <h1 className="text-3xl font-display font-extrabold tracking-tight flex items-center gap-2">
          <Wand2 className="size-7 text-purple-500" />
          {t("settings_title")}
        </h1>
        <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
          {t("settings_subtitle")}
        </p>
      </div>

      <CcavaiSettingsForm tenantId={tenant.id} settings={settings} />
    </div>
  );
}
