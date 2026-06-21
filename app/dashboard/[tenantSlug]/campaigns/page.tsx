import { Rocket } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { getTenantBySlug } from "@/lib/tenant";
import { requirePermission } from "@/lib/auth";
import { listCampaignsWithSteps } from "@/lib/queries/campaigns";
import { Card } from "@/components/ui/card";
import { CampaignsManager } from "@/components/campaigns/campaigns-manager";

export const dynamic = "force-dynamic";

export default async function CampaignsPage({
  params,
}: {
  params: Promise<{ tenantSlug: string }>;
}) {
  const { tenantSlug } = await params;
  const tenant = await getTenantBySlug(tenantSlug);
  await requirePermission(tenant.id, "marketing", "read");
  const t = await getTranslations("campaigns");

  const campaigns = await listCampaignsWithSteps(tenant.id);

  return (
    <div className="p-6 md:p-8 max-w-4xl">
      <div className="mb-6">
        <h1 className="text-3xl font-display font-extrabold tracking-tight flex items-center gap-2">
          <Rocket className="size-7 text-primary" />
          {t("page_title")}
        </h1>
        <p className="text-sm text-muted-foreground mt-1">{t("page_subtitle")}</p>
      </div>

      {campaigns.length === 0 ? (
        <Card className="py-16 flex flex-col items-center text-center">
          <Rocket className="size-10 text-muted-foreground mb-4" />
          <p className="font-medium">{t("empty_title")}</p>
          <p className="text-sm text-muted-foreground mt-1 max-w-md">{t("empty_subtitle")}</p>
        </Card>
      ) : (
        <CampaignsManager tenantId={tenant.id} campaigns={campaigns} />
      )}
    </div>
  );
}
