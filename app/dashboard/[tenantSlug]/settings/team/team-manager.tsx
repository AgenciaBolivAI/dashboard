"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { useTranslations, useLocale } from "next-intl";
import { Copy, Mail, Trash2, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  inviteUserAction,
  revokeInvitationAction,
  updateMemberRoleAction,
  removeMemberAction,
  type Member,
  type PendingInvitation,
  type TeamState,
} from "@/lib/actions/team";

const initial: TeamState = { error: null };

const ROLE_IDS = ["owner", "admin", "operator", "viewer"] as const;
type RoleId = (typeof ROLE_IDS)[number];

export function TeamManager({
  tenantId,
  members,
  invitations,
  canManage = true,
}: {
  tenantId: string;
  members: Member[];
  invitations: PendingInvitation[];
  /** Only admins/owners may invite, change roles, or remove members. */
  canManage?: boolean;
}) {
  const t = useTranslations("team");
  const locale = useLocale();
  const [state, action, pending] = useActionState(inviteUserAction, initial);
  const [lastInviteUrl, setLastInviteUrl] = useState<string | null>(null);
  const [busy, startBusy] = useTransition();

  useEffect(() => {
    if (state.error) toast.error(state.error);
    if (state.success && state.inviteUrl) {
      toast.success(t("toast_invite_created"));
      setLastInviteUrl(state.inviteUrl);
    }
  }, [state, t]);

  function handleRevoke(inv: PendingInvitation) {
    if (!confirm(t("confirm_revoke", { email: inv.email }))) return;
    startBusy(async () => {
      const res = await revokeInvitationAction(tenantId, inv.id);
      if (res.error) toast.error(res.error);
      else toast.success(t("toast_invite_revoked"));
    });
  }

  function handleRoleChange(m: Member, role: RoleId) {
    startBusy(async () => {
      const res = await updateMemberRoleAction(tenantId, m.user_id, role);
      if (res.error) toast.error(res.error);
      else toast.success(t("toast_role_updated"));
    });
  }

  function handleRemove(m: Member) {
    if (!confirm(t("confirm_remove_member", { email: m.email }))) return;
    startBusy(async () => {
      const res = await removeMemberAction(tenantId, m.user_id);
      if (res.error) toast.error(res.error);
      else toast.success(t("toast_member_deleted"));
    });
  }

  function copyUrl(url: string) {
    navigator.clipboard.writeText(url);
    toast.success(t("toast_link_copied"));
  }

  return (
    <div className="space-y-8">
      {/* Invite form — admins/owners only */}
      {canManage ? (
      <section>
        <h3 className="font-display font-semibold mb-3">{t("invite_title")}</h3>
        <form action={action} className="space-y-3">
          <input type="hidden" name="tenant_id" value={tenantId} />
          <div className="flex flex-col sm:flex-row gap-2">
            <div className="flex-1 space-y-1">
              <Label htmlFor="invite-email" className="sr-only">
                {t("invite_email_placeholder")}
              </Label>
              <Input
                id="invite-email"
                name="email"
                type="email"
                placeholder={t("invite_email_placeholder")}
                required
              />
            </div>
            <select
              name="role"
              defaultValue="operator"
              className="h-10 rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {ROLE_IDS.map((id) => (
                <option key={id} value={id}>
                  {t(`role_${id}`)}
                </option>
              ))}
            </select>
            <Button type="submit" disabled={pending}>
              <UserPlus className="size-4" />
              {pending ? t("invite_generating") : t("invite_submit")}
            </Button>
          </div>
        </form>

        {lastInviteUrl ? (
          <div className="mt-3 rounded-md border border-primary/30 bg-primary/5 p-3 space-y-2">
            <div className="flex items-center gap-2 text-sm">
              <Mail className="size-4 text-primary shrink-0" />
              <span className="font-medium">{t("invite_link_share")}</span>
            </div>
            <div className="flex items-center gap-2">
              <Input value={lastInviteUrl} readOnly className="font-mono text-xs" />
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={() => copyUrl(lastInviteUrl)}
              >
                <Copy className="size-4" />
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">{t("invite_link_expiry")}</p>
          </div>
        ) : null}
      </section>
      ) : null}

      {canManage ? <Separator /> : null}

      {/* Members */}
      <section>
        <h3 className="font-display font-semibold mb-3">
          {t("members_count", { count: members.length })}
        </h3>
        {members.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("no_members")}</p>
        ) : (
          <div className="space-y-2">
            {members.map((m) => (
              <div
                key={m.user_id}
                className="flex items-center justify-between gap-3 rounded-md border border-border bg-card px-3 py-2"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate">
                    {m.email}
                    {m.is_self ? (
                      <span className="ml-2 text-xs text-muted-foreground">{t("you_tag")}</span>
                    ) : null}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {t(`role_${m.role}_hint`)}
                  </p>
                </div>
                {canManage ? (
                  <>
                    <select
                      value={m.role}
                      onChange={(e) => handleRoleChange(m, e.target.value as RoleId)}
                      disabled={busy || m.is_self}
                      className="h-8 rounded-md border border-input bg-background px-2 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
                    >
                      {ROLE_IDS.map((id) => (
                        <option key={id} value={id}>
                          {t(`role_${id}`)}
                        </option>
                      ))}
                    </select>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-muted-foreground hover:text-destructive"
                      onClick={() => handleRemove(m)}
                      disabled={busy || m.is_self}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </>
                ) : (
                  <Badge variant="outline" className="text-xs">{t(`role_${m.role}`)}</Badge>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Pending invitations — admins/owners only */}
      {canManage && invitations.length > 0 ? (
        <>
          <Separator />
          <section>
            <h3 className="font-display font-semibold mb-3">
              {t("pending_count", { count: invitations.length })}
            </h3>
            <div className="space-y-2">
              {invitations.map((inv) => (
                <div
                  key={inv.id}
                  className="flex items-center justify-between gap-3 rounded-md border border-border bg-card px-3 py-2"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">{inv.email}</p>
                    <p className="text-xs text-muted-foreground">
                      {t("pending_role_prefix")} <Badge variant="outline">{t(`role_${inv.role}`)}</Badge> ·{" "}
                      {t("pending_expires", {
                        date: new Date(inv.expires_at).toLocaleDateString(locale),
                      })}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => {
                      const base = window.location.origin;
                      copyUrl(`${base}/invitations/${inv.token}`);
                    }}
                    title={t("copy_invite_title")}
                  >
                    <Copy className="size-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-muted-foreground hover:text-destructive"
                    onClick={() => handleRevoke(inv)}
                    disabled={busy}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              ))}
            </div>
          </section>
        </>
      ) : null}
    </div>
  );
}
