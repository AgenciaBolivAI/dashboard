"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Plus, Trash2, Loader2, Shield } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FEATURES, LEVELS, type Feature, type Level, type PermissionSet } from "@/lib/permissions";
import {
  createRoleAction,
  updateRoleAction,
  deleteRoleAction,
  assignRoleAction,
} from "@/lib/actions/roles";
import type { CustomRole } from "@/lib/queries/roles";

type Member = { user_id: string; email: string };

export function RolesManager({
  tenantId,
  roles,
  members,
  memberRoleIds,
}: {
  tenantId: string;
  roles: CustomRole[];
  members: Member[];
  memberRoleIds: Record<string, string | null>;
}) {
  const t = useTranslations("roles");
  const tc = useTranslations("common");
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [editing, setEditing] = useState<CustomRole | null>(null);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [perms, setPerms] = useState<PermissionSet>({});

  function openCreate() {
    setCreating(true);
    setEditing(null);
    setName("");
    setPerms({});
  }
  function openEdit(role: CustomRole) {
    setEditing(role);
    setCreating(false);
    setName(role.name);
    setPerms({ ...role.permissions });
  }
  function close() {
    setCreating(false);
    setEditing(null);
  }

  function setLevel(feature: Feature, level: Level) {
    setPerms((p) => {
      const next = { ...p };
      if (level === "none") delete next[feature];
      else next[feature] = level;
      return next;
    });
  }

  function save() {
    if (!name.trim()) {
      toast.error(t("name_required"));
      return;
    }
    startTransition(async () => {
      const res = editing
        ? await updateRoleAction(tenantId, editing.id, { name, permissions: perms })
        : await createRoleAction(tenantId, name, perms);
      if (!res.ok) {
        toast.error(res.error ?? tc("error"));
        return;
      }
      close();
      router.refresh();
    });
  }

  function remove(role: CustomRole) {
    if (!confirm(t("delete_confirm"))) return;
    startTransition(async () => {
      const res = await deleteRoleAction(tenantId, role.id);
      if (!res.ok) toast.error(res.error ?? tc("error"));
      else router.refresh();
    });
  }

  function assign(userId: string, roleId: string) {
    startTransition(async () => {
      const res = await assignRoleAction(tenantId, userId, roleId || null);
      if (!res.ok) toast.error(res.error ?? tc("error"));
      else router.refresh();
    });
  }

  const editor = creating || editing;

  return (
    <div className="space-y-5">
      {/* Custom roles list */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{t("intro")}</p>
        {!editor ? (
          <Button size="sm" onClick={openCreate}>
            <Plus className="size-4" />
            {t("create_role")}
          </Button>
        ) : null}
      </div>

      {editor ? (
        <div className="rounded-lg border border-border p-4 space-y-4">
          <div>
            <label className="text-xs text-muted-foreground">{t("role_name")}</label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("role_name_placeholder")}
              className="mt-1 max-w-sm"
            />
          </div>
          <div>
            <p className="text-xs text-muted-foreground mb-2">{t("permissions_label")}</p>
            <div className="grid sm:grid-cols-2 gap-x-6 gap-y-1.5">
              {FEATURES.map((f) => (
                <div key={f} className="flex items-center justify-between gap-2">
                  <span className="text-sm">{t(`feature_${f}`)}</span>
                  <select
                    value={perms[f] ?? "none"}
                    onChange={(e) => setLevel(f, e.target.value as Level)}
                    className="rounded-md border border-input bg-background px-2 py-1 text-xs"
                  >
                    {LEVELS.map((lv) => (
                      <option key={lv} value={lv}>
                        {t(`level_${lv}`)}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          </div>
          <div className="flex gap-2">
            <Button size="sm" onClick={save} disabled={pending}>
              {pending ? <Loader2 className="size-4 animate-spin" /> : null}
              {t("save")}
            </Button>
            <Button size="sm" variant="outline" onClick={close} disabled={pending}>
              {t("cancel")}
            </Button>
          </div>
        </div>
      ) : roles.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("no_custom_roles")}</p>
      ) : (
        <div className="space-y-2">
          {roles.map((role) => (
            <div key={role.id} className="flex items-center gap-3 rounded-lg border border-border px-3 py-2">
              <Shield className="size-4 text-primary shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium">{role.name}</p>
                <p className="text-xs text-muted-foreground truncate">
                  {Object.entries(role.permissions)
                    .map(([f, lv]) => `${t(`feature_${f}` as never)}: ${t(`level_${lv}` as never)}`)
                    .join(" · ") || t("no_permissions")}
                </p>
              </div>
              <Button size="sm" variant="outline" onClick={() => openEdit(role)}>
                {t("edit")}
              </Button>
              <button
                type="button"
                onClick={() => remove(role)}
                className="text-muted-foreground hover:text-red-600"
                aria-label={t("delete")}
              >
                <Trash2 className="size-4" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Assign roles to members */}
      {!editor && roles.length > 0 ? (
        <div className="border-t border-border pt-4">
          <p className="text-sm font-medium mb-2">{t("assign_title")}</p>
          <div className="space-y-1.5">
            {members.map((m) => (
              <div key={m.user_id} className="flex items-center gap-3 text-sm">
                <span className="flex-1 truncate">{m.email}</span>
                <select
                  value={memberRoleIds[m.user_id] ?? ""}
                  onChange={(e) => assign(m.user_id, e.target.value)}
                  disabled={pending}
                  className="rounded-md border border-input bg-background px-2 py-1 text-xs max-w-48"
                >
                  <option value="">{t("builtin_tier")}</option>
                  {roles.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
