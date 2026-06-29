import { FileInput } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { getTenantBySlug } from "@/lib/tenant";
import { requirePermission } from "@/lib/auth";
import { getAppUrl } from "@/lib/stripe";
import { listLeadForms } from "@/lib/queries/marketing";
import { FormsManager } from "@/components/marketing/forms-manager";

export const dynamic = "force-dynamic";

export default async function LeadFormsPage({
  params,
}: {
  params: Promise<{ tenantSlug: string }>;
}) {
  const { tenantSlug } = await params;
  const tenant = await getTenantBySlug(tenantSlug);
  await requirePermission(tenant.id, "marketing", "read");
  const t = await getTranslations("lead_forms");

  const forms = await listLeadForms(tenant.id);

  return (
    <div className="p-6 md:p-8 max-w-4xl">
      <div className="mb-6">
        <h1 className="text-3xl font-display font-extrabold tracking-tight flex items-center gap-2">
          <FileInput className="size-7 text-primary" />
          {t("page_title")}
        </h1>
        <p className="text-sm text-muted-foreground mt-1">{t("page_subtitle")}</p>
      </div>

      <FormsManager tenantId={tenant.id} forms={forms} appUrl={getAppUrl()} />
    </div>
  );
}
