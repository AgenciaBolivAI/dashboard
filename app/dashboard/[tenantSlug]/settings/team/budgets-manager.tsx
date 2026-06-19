"use client";

import { useActionState, useEffect, useMemo, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Plus, Trash2, Users, Wallet, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  createGroupAction,
  deleteGroupAction,
  assignMemberAction,
  unassignMemberAction,
  setBudgetAction,
  removeBudgetAction,
  type Member,
  type EmployeeGroup,
  type CreditBudget,
  type TeamState,
} from "@/lib/actions/team";

const initial: TeamState = { error: null };

export function BudgetsManager({
  tenantId,
  members,
  groups,
  budgets,
}: {
  tenantId: string;
  members: Member[];
  groups: EmployeeGroup[];
  budgets: CreditBudget[];
}) {
  const t = useTranslations("team");
  const [state, action, pending] = useActionState(createGroupAction, initial);
  const [busy, startBusy] = useTransition();

  useEffect(() => {
    if (state.error) toast.error(state.error);
    if (state.success) toast.success(t("toast_group_created"));
  }, [state, t]);

  const emailOf = useMemo(() => {
    const m = new Map(members.map((x) => [x.user_id, x.email]));
    return (id: string) => m.get(id) ?? "—";
  }, [members]);

  const assignedIds = useMemo(() => new Set(groups.flatMap((g) => g.member_ids)), [groups]);
  const ungrouped = members.filter((m) => !assignedIds.has(m.user_id));

  const budgetFor = (scopeType: "user" | "group", scopeId: string) =>
    budgets.find((b) => b.scope_type === scopeType && b.scope_id === scopeId) ?? null;
  const groupOf = (userId: string) => groups.find((g) => g.member_ids.includes(userId)) ?? null;

  function run(p: Promise<TeamState>, okMsg: string) {
    startBusy(async () => {
      const res = await p;
      if (res.error) toast.error(res.error);
      else toast.success(okMsg);
    });
  }

  return (
    <div className="space-y-8">
      {/* Groups */}
      <section>
        <h3 className="font-display font-semibold mb-3 flex items-center gap-2">
          <Users className="size-4" /> {t("groups_title")}
        </h3>
        <form action={action} className="flex flex-col sm:flex-row gap-2">
          <input type="hidden" name="tenant_id" value={tenantId} />
          <Input name="name" placeholder={t("group_name_placeholder")} required maxLength={60} className="flex-1" />
          <Button type="submit" disabled={pending}>
            <Plus className="size-4" /> {pending ? t("creating") : t("create_group")}
          </Button>
        </form>

        {groups.length === 0 ? (
          <p className="text-sm text-muted-foreground mt-3">{t("no_groups")}</p>
        ) : (
          <div className="space-y-3 mt-4">
            {groups.map((g) => (
              <div key={g.id} className="rounded-md border border-border bg-card p-3 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-medium text-sm">{g.name}</p>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-muted-foreground hover:text-destructive"
                    disabled={busy}
                    onClick={() => {
                      if (confirm(t("delete_group_confirm", { name: g.name })))
                        run(deleteGroupAction(tenantId, g.id), t("toast_group_deleted"));
                    }}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>

                <div className="flex flex-wrap gap-2">
                  {g.member_ids.length === 0 ? (
                    <span className="text-xs text-muted-foreground">{t("group_no_members")}</span>
                  ) : (
                    g.member_ids.map((uid) => (
                      <Badge key={uid} variant="outline" className="gap-1">
                        {emailOf(uid)}
                        <button
                          type="button"
                          disabled={busy}
                          className="hover:text-destructive"
                          onClick={() => run(unassignMemberAction(tenantId, uid), t("toast_member_removed"))}
                        >
                          <X className="size-3" />
                        </button>
                      </Badge>
                    ))
                  )}
                </div>

                {ungrouped.length > 0 ? (
                  <select
                    defaultValue=""
                    disabled={busy}
                    className="h-8 rounded-md border border-input bg-background px-2 text-xs"
                    onChange={(e) => {
                      const uid = e.target.value;
                      if (uid) {
                        run(assignMemberAction(tenantId, g.id, uid), t("toast_member_added"));
                        e.target.value = "";
                      }
                    }}
                  >
                    <option value="" disabled>
                      {t("add_member")}
                    </option>
                    {ungrouped.map((m) => (
                      <option key={m.user_id} value={m.user_id}>
                        {m.email}
                      </option>
                    ))}
                  </select>
                ) : null}

                <Separator />
                <BudgetRow
                  tenantId={tenantId}
                  scopeType="group"
                  scopeId={g.id}
                  budget={budgetFor("group", g.id)}
                  busy={busy}
                  onChange={run}
                />
              </div>
            ))}
          </div>
        )}
      </section>

      <Separator />

      {/* Individual budgets */}
      <section>
        <h3 className="font-display font-semibold mb-3 flex items-center gap-2">
          <Wallet className="size-4" /> {t("budgets_title")}
        </h3>
        <p className="text-xs text-muted-foreground mb-3">{t("budgets_help")}</p>
        {members.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("no_members")}</p>
        ) : (
          <div className="space-y-2">
            {members.map((m) => {
              const grp = groupOf(m.user_id);
              return (
                <div
                  key={m.user_id}
                  className="flex flex-col gap-2 rounded-md border border-border bg-card px-3 py-2 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{m.email}</p>
                    {grp ? (
                      <p className="text-xs text-muted-foreground">
                        {t("covered_by_team", { name: grp.name })}
                      </p>
                    ) : null}
                  </div>
                  {grp ? null : (
                    <BudgetRow
                      tenantId={tenantId}
                      scopeType="user"
                      scopeId={m.user_id}
                      budget={budgetFor("user", m.user_id)}
                      busy={busy}
                      onChange={run}
                    />
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

function BudgetRow({
  tenantId,
  scopeType,
  scopeId,
  budget,
  busy,
  onChange,
}: {
  tenantId: string;
  scopeType: "user" | "group";
  scopeId: string;
  budget: CreditBudget | null;
  busy: boolean;
  onChange: (p: Promise<TeamState>, okMsg: string) => void;
}) {
  const t = useTranslations("team");
  const [editing, setEditing] = useState(false);
  const [amount, setAmount] = useState(budget ? String(budget.allocated_credits) : "");
  const [period, setPeriod] = useState<"monthly" | "one_time">(budget?.period ?? "monthly");

  function save() {
    const n = Number(amount);
    if (!Number.isFinite(n) || n < 0) {
      toast.error(t("invalid_amount"));
      return;
    }
    onChange(
      setBudgetAction({ tenantId, scopeType, scopeId, period, allocatedCredits: Math.floor(n) }),
      t("toast_budget_saved"),
    );
    setEditing(false);
  }

  if (budget && !editing) {
    const remaining = Math.max(budget.allocated_credits - budget.spent_credits, 0);
    return (
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <span className="text-muted-foreground">
          {t("budget_usage", {
            spent: budget.spent_credits.toLocaleString(),
            allocated: budget.allocated_credits.toLocaleString(),
          })}
          <span className="mx-2">·</span>
          {t(budget.period === "monthly" ? "period_monthly" : "period_one_time")}
          <span className="ml-2 text-foreground">
            {t("budget_available", { remaining: remaining.toLocaleString() })}
          </span>
        </span>
        <div className="flex gap-1">
          <Button variant="outline" size="sm" disabled={busy} onClick={() => setEditing(true)}>
            {t("edit")}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground hover:text-destructive"
            disabled={busy}
            onClick={() => onChange(removeBudgetAction(tenantId, budget.id), t("toast_budget_removed"))}
          >
            {t("remove")}
          </Button>
        </div>
      </div>
    );
  }

  if (!budget && !editing) {
    return (
      <Button variant="outline" size="sm" disabled={busy} onClick={() => setEditing(true)}>
        <Plus className="size-3" /> {t("assign_budget")}
      </Button>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Input
        type="number"
        min={0}
        step={1}
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        placeholder={t("credits_placeholder")}
        className="w-32 h-8 text-sm"
      />
      <select
        value={period}
        onChange={(e) => setPeriod(e.target.value as "monthly" | "one_time")}
        className="h-8 rounded-md border border-input bg-background px-2 text-xs"
      >
        <option value="monthly">{t("period_monthly")}</option>
        <option value="one_time">{t("period_one_time")}</option>
      </select>
      <Button size="sm" disabled={busy} onClick={save}>
        {t("save")}
      </Button>
      <Button size="sm" variant="ghost" disabled={busy} onClick={() => setEditing(false)}>
        {t("cancel")}
      </Button>
    </div>
  );
}
