import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getTenantBySlug } from "@/lib/tenant";
import { getRoleOnTenant } from "@/lib/auth";
import { loadTeam, loadTeamBudgets } from "@/lib/actions/team";
import { getSeatUsage, SEAT_FEE_USD, SEAT_FEE_CREDITS } from "@/lib/billing/seats";
import { listRoles, getMemberRoleIds } from "@/lib/queries/roles";
import { TeamManager } from "./team-manager";
import { BudgetsManager } from "./budgets-manager";
import { RolesManager } from "./roles-manager";
import { getTranslations } from "next-intl/server";

export default async function TeamPage({
  params,
}: {
  params: Promise<{ tenantSlug: string }>;
}) {
  const { tenantSlug } = await params;
  const tenant = await getTenantBySlug(tenantSlug);
  const { members, invitations } = await loadTeam(tenant.id);
  const seats = await getSeatUsage(tenant.id);
  const t = await getTranslations("settings_team");
  const tt = await getTranslations("team");

  // Groups + budgets + roles are admin-only; non-admins still see the members list.
  const role = await getRoleOnTenant(tenant.id);
  const isAdmin = role === "owner" || role === "admin" || role === "bolivai_admin";
  const budgetData = isAdmin ? await loadTeamBudgets(tenant.id) : null;
  const tr = await getTranslations("roles");
  const [roles, memberRoleIds] = isAdmin
    ? await Promise.all([listRoles(tenant.id), getMemberRoleIds(tenant.id)])
    : [[], {}];

  return (
    <div className="space-y-6">
      {/* Seat usage + monthly cost */}
      <Card>
        <CardHeader>
          <CardTitle>{t("seats_title")}</CardTitle>
          <CardDescription>
            {t("seats_note", { included: seats.included, fee: SEAT_FEE_USD, credits: SEAT_FEE_CREDITS })}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm font-medium">
              {t("seats_in_use", { occupied: seats.occupied, included: seats.included })}
            </p>
            {seats.billable > 0 ? (
              <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary ring-1 ring-inset ring-primary/20 tabular-nums">
                {t("seats_paid", {
                  billable: seats.billable,
                  fee: SEAT_FEE_USD,
                  cost: seats.monthlyCostUsd,
                  credits: seats.monthlyCostCredits,
                })}
              </span>
            ) : (
              <span className="text-xs text-muted-foreground">{t("seats_none")}</span>
            )}
          </div>
        </CardContent>
      </Card>

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
            canManage={isAdmin}
            nextSeatBillable={seats.nextSeatBillable}
          />
        </CardContent>
      </Card>

      {isAdmin ? (
        <Card>
          <CardHeader>
            <CardTitle>{tr("title")}</CardTitle>
            <CardDescription>{tr("description")}</CardDescription>
          </CardHeader>
          <CardContent>
            <RolesManager
              tenantId={tenant.id}
              roles={roles}
              members={members.map((m) => ({ user_id: m.user_id, email: m.email }))}
              memberRoleIds={memberRoleIds}
            />
          </CardContent>
        </Card>
      ) : null}

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
