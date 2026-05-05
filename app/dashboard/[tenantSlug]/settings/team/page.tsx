import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getTenantBySlug } from "@/lib/tenant";
import { loadTeam } from "@/lib/actions/team";
import { TeamManager } from "./team-manager";

export default async function TeamPage({
  params,
}: {
  params: Promise<{ tenantSlug: string }>;
}) {
  const { tenantSlug } = await params;
  const tenant = await getTenantBySlug(tenantSlug);
  const { members, invitations } = await loadTeam(tenant.id);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Equipo</CardTitle>
        <CardDescription>
          Invita a colegas a gestionar este agente. Cada persona tiene un rol que
          define qué puede hacer.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <TeamManager
          tenantId={tenant.id}
          members={members}
          invitations={invitations}
        />
      </CardContent>
    </Card>
  );
}
