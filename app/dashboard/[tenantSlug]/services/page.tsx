import { getTenantBySlug } from "@/lib/tenant";
import { createClient } from "@/lib/supabase/server";
import { ServicesManager } from "@/components/services/services-manager";
import type { ServiceRow, StaffOption } from "@/components/services/service-form";
import { getServiceStaffMap } from "@/lib/queries/staff-services";
import { getTranslations } from "next-intl/server";

export default async function ServicesPage({
  params,
}: {
  params: Promise<{ tenantSlug: string }>;
}) {
  const { tenantSlug } = await params;
  const tenant = await getTenantBySlug(tenantSlug);
  const t = await getTranslations("services");

  const supabase = await createClient();

  const [{ data: serviceRows }, { data: staffRows }, staffByService] =
    await Promise.all([
      supabase
        .from("services")
        .select("id, name, description, price_amount, price_currency, duration_min, category, active")
        .eq("tenant_id", tenant.id)
        .order("category", { ascending: true, nullsFirst: false })
        .order("name"),
      supabase
        .from("staff")
        .select("id, name, active")
        .eq("tenant_id", tenant.id)
        .order("active", { ascending: false })
        .order("name"),
      getServiceStaffMap(tenant.id),
    ]);

  const services = ((serviceRows ?? []) as ServiceRow[]).map((s) => ({
    ...s,
    price_amount: s.price_amount !== null ? Number(s.price_amount) : null,
  }));

  const allStaff = (staffRows ?? []) as StaffOption[];

  return (
    <div className="p-6 md:p-8 max-w-5xl">
      <div className="mb-6">
        <h1 className="text-3xl font-display font-extrabold tracking-tight">
          {t("page_title")}
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          {t("page_description")}
        </p>
      </div>

      <ServicesManager
        tenantId={tenant.id}
        services={services}
        allStaff={allStaff}
        staffByService={staffByService}
      />
    </div>
  );
}
