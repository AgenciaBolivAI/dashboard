import { Send } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { getTenantBySlug } from "@/lib/tenant";
import { requirePermission } from "@/lib/auth";
import { listBroadcasts } from "@/lib/queries/marketing";
import { getSmsSettingsMasked } from "@/lib/marketing/sms";
import { BroadcastsManager } from "@/components/marketing/broadcasts-manager";
import { SmsSettingsCard } from "@/components/marketing/sms-settings-card";

export const dynamic = "force-dynamic";

export default async function BroadcastsPage({
  params,
}: {
  params: Promise<{ tenantSlug: string }>;
}) {
  const { tenantSlug } = await params;
  const tenant = await getTenantBySlug(tenantSlug);
  await requirePermission(tenant.id, "marketing", "read");
  const t = await getTranslations("broadcasts");

  const [campaigns, smsSettings] = await Promise.all([
    listBroadcasts(tenant.id),
    getSmsSettingsMasked(tenant.id),
  ]);

  return (
    <div className="p-6 md:p-8 max-w-4xl">
      <div className="mb-6">
        <h1 className="text-3xl font-display font-extrabold tracking-tight flex items-center gap-2">
          <Send className="size-7 text-primary" />
          {t("page_title")}
        </h1>
        <p className="text-sm text-muted-foreground mt-1">{t("page_subtitle")}</p>
      </div>

      <BroadcastsManager tenantId={tenant.id} campaigns={campaigns} />

      <div className="mt-8">
        <SmsSettingsCard tenantId={tenant.id} settings={smsSettings} />
      </div>
    </div>
  );
}
