import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getTenantBySlug } from "@/lib/tenant";
import { getRoleOnTenant } from "@/lib/auth";
import { loadTeam, loadTeamBudgets } from "@/lib/actions/team";
import { TeamManager } from "./team-manager";
import { BudgetsManager } from "./budgets-manager";
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
  const tt = await getTranslations("team");

  // Groups + budgets are admin-only; non-admins still see the members list.
  const role = await getRoleOnTenant(tenant.id);
  const isAdmin = role === "owner" || role === "admin" || role === "bolivai_admin";
  const budgetData = isAdmin ? await loadTeamBudgets(tenant.id) : null;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>{t("title")}</CardTitle>
          <CardDescription>{t("description")}</CardDescription>
        </CardHeader>
        <CardContent>
          <TeamManager
            tenantId={tenant.id}
            members={members}
            invitations={invitations}
          />
        </CardContent>
      </Card>

      {budgetData ? (
        <Card>
          <CardHeader>
            <CardTitle>{tt("card_title")}</CardTitle>
            <CardDescription>{tt("card_desc")}</CardDescription>
          </CardHeader>
          <CardContent>
            <BudgetsManager
              tenantId={tenant.id}
              members={members}
              groups={budgetData.groups}
              budgets={budgetData.budgets}
            />
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
