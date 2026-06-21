import { getTenantBySlug } from "@/lib/tenant";
import { createClient } from "@/lib/supabase/server";
import {
  StaffManager,
  type StaffRow,
  type ServiceOption,
} from "@/components/staff/staff-manager";
import { getStaffServiceMap } from "@/lib/queries/staff-services";
import { RealtimeSearch } from "@/components/ui/realtime-search";
import { getTranslations } from "next-intl/server";

export default async function StaffPage({
  params,
  searchParams,
}: {
  params: Promise<{ tenantSlug: string }>;
  searchParams: Promise<{ q?: string }>;
}) {
  const { tenantSlug } = await params;
  const { q } = await searchParams;
  const tenant = await getTenantBySlug(tenantSlug);
  const t = await getTranslations("staff");
  const term = q?.trim().replace(/[,()*]/g, " ").trim();

  const supabase = await createClient();

  let staffQuery = supabase
    .from("staff")
    .select("id, name, email, role, active")
    .eq("tenant_id", tenant.id)
    .order("active", { ascending: false })
    .order("name");
  if (term) staffQuery = staffQuery.or(`name.ilike.*${term}*,email.ilike.*${term}*,role.ilike.*${term}*`);

  const [{ data: staffRows }, { data: serviceRows }, servicesByStaff] =
    await Promise.all([
      staffQuery,
      supabase
        .from("services")
        .select("id, name, duration_min, active")
        .eq("tenant_id", tenant.id)
        .order("active", { ascending: false })
        .order("name"),
      getStaffServiceMap(tenant.id),
    ]);

  const staff = (staffRows ?? []) as StaffRow[];
  const allServices = (serviceRows ?? []) as ServiceOption[];

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

      <div className="mb-4">
        <RealtimeSearch placeholder={t("search_placeholder")} />
      </div>

      <StaffManager
        tenantId={tenant.id}
        staff={staff}
        allServices={allServices}
        servicesByStaff={servicesByStaff}
      />
    </div>
  );
}
