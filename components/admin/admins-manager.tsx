"use client";

import { useActionState, useEffect, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Trash2, ShieldPlus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  promoteAdminAction,
  demoteAdminAction,
  type AdminState,
  type StaffRow,
} from "@/lib/actions/admin";
import { formatDate } from "@/lib/utils";

const initial: AdminState = { error: null };

export function AdminsManager({ staff }: { staff: StaffRow[] }) {
  const t = useTranslations("admin_users");
  const locale = useLocale();
  const [state, action, pending] = useActionState(promoteAdminAction, initial);
  const [busy, startBusy] = useTransition();

  useEffect(() => {
    if (state.error) toast.error(state.error);
    if (state.success) toast.success(t("toast_promoted"));
  }, [state, t]);

  function handleDemote(s: StaffRow) {
    if (!confirm(t("confirm_demote", { email: s.email }))) return;
    startBusy(async () => {
      const res = await demoteAdminAction(s.user_id);
      if (res.error) toast.error(res.error);
      else toast.success(t("toast_demoted"));
    });
  }

  return (
    <div className="space-y-6">
      <section>
        <h3 className="font-display font-semibold mb-3">{t("promote_title")}</h3>
        <form action={action} className="space-y-3">
          <div className="flex flex-col sm:flex-row gap-2">
            <div className="flex-1 space-y-1">
              <Label htmlFor="promote-email" className="sr-only">
                {t("email_label")}
              </Label>
              <Input
                id="promote-email"
                name="email"
                type="email"
                placeholder="staff@bolivai.com"
                required
              />
            </div>
            <select
              name="role"
              defaultValue="admin"
              className="h-10 rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <option value="admin">{t("role_admin")}</option>
              <option value="superadmin">{t("role_superadmin")}</option>
            </select>
            <Button type="submit" disabled={pending}>
              <ShieldPlus className="size-4" />
              {pending ? t("promoting") : t("promote_button")}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            {t("promote_hint")}
          </p>
        </form>
      </section>

      <Separator />

      <section>
        <h3 className="font-display font-semibold mb-3">
          {t("current_team", { count: staff.length })}
        </h3>
        {staff.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("no_access_yet")}</p>
        ) : (
          <div className="space-y-2">
            {staff.map((s) => (
              <div
                key={s.user_id}
                className="flex items-center justify-between gap-3 rounded-md border border-border bg-card px-3 py-2"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate">{s.email}</p>
                  <p className="text-xs text-muted-foreground">
                    {t("since", { date: formatDate(s.created_at, locale) })}
                  </p>
                </div>
                <Badge variant={s.role === "superadmin" ? "default" : "outline"}>
                  {s.role}
                </Badge>
                <Button
                  variant="ghost"
                  size="icon"
                  className="text-muted-foreground hover:text-destructive"
                  onClick={() => handleDemote(s)}
                  disabled={busy}
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
