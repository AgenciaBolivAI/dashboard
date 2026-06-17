import { Bot } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { getTenantBySlug } from "@/lib/tenant";
import { AssistantChat } from "@/components/assistant/assistant-chat";

export const dynamic = "force-dynamic";

export default async function AssistantPage({
  params,
}: {
  params: Promise<{ tenantSlug: string }>;
}) {
  const { tenantSlug } = await params;
  // Access is enforced by the tenant layout (requireTenantAccess).
  await getTenantBySlug(tenantSlug);
  const t = await getTranslations("assistant");

  return (
    <div className="flex flex-col h-full">
      <div className="px-6 md:px-8 pt-6">
        <h1 className="text-2xl font-display font-extrabold tracking-tight flex items-center gap-2">
          <Bot className="size-6 text-primary" />
          {t("page_title")}
        </h1>
        <p className="text-sm text-muted-foreground mt-1">{t("page_subtitle")}</p>
      </div>
      <AssistantChat tenantSlug={tenantSlug} />
    </div>
  );
}
