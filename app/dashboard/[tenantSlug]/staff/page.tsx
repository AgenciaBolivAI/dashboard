import { getTenantBySlug } from "@/lib/tenant";
import { createClient } from "@/lib/supabase/server";
import {
  StaffManager,
  type StaffRow,
  type ServiceOption,
} from "@/components/staff/staff-manager";
import { getStaffServiceMap } from "@/lib/queries/staff-services";

export default async function StaffPage({
  params,
}: {
  params: Promise<{ tenantSlug: string }>;
}) {
  const { tenantSlug } = await params;
  const tenant = await getTenantBySlug(tenantSlug);

  const supabase = await createClient();

  const [{ data: staffRows }, { data: serviceRows }, servicesByStaff] =
    await Promise.all([
      supabase
        .from("staff")
        .select("id, name, email, role, active")
        .eq("tenant_id", tenant.id)
        .order("active", { ascending: false })
        .order("name"),
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
          Personal
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Las personas que dan servicio. Marca qué servicios ofrece cada una
          para que el agente solo asigne reservas a quien sabe hacerlas.
        </p>
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
