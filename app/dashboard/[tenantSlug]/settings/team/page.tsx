import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getTenantBySlug } from "@/lib/tenant";
import { loadTeam } from "@/lib/actions/team";
import { TeamManager } from "./team-manager";
import { getTranslations } from "next-intl/server";

export default async function TeamPage({
  params,
}: {
  params: Promise<{ tenantSlug: string }>;
}) {
  const { tenantSlug } = await params;
  const tenant = await getTenantBySlug(tenantSlug);
  const { members, invitations } = await loadTeam(tenant.id);
  const t = await getTranslations("settings_team");

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription>
          {t("description")}
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
