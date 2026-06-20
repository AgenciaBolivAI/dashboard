"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  createStaffAction,
  updateStaffAction,
  deleteStaffAction,
  type StaffState,
} from "@/lib/actions/staff";

const initial: StaffState = { error: null };

export type StaffRow = {
  id: string;
  name: string;
  email: string | null;
  role: string | null;
  active: boolean;
};

export type ServiceOption = {
  id: string;
  name: string;
  duration_min: number;
  active: boolean;
};

export function StaffManager({
  tenantId,
  staff,
  allServices,
  servicesByStaff,
}: {
  tenantId: string;
  staff: StaffRow[];
  allServices: ServiceOption[];
  servicesByStaff: Record<string, string[]>;
}) {
  const t = useTranslations("staff");
  const [editing, setEditing] = useState<StaffRow | null>(null);
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  function openNew() {
    setEditing(null);
    setOpen(true);
  }
  function openEdit(s: StaffRow) {
    setEditing(s);
    setOpen(true);
  }
  function handleDelete(s: StaffRow) {
    if (!confirm(t("delete_confirm", { name: s.name }))) return;
    startTransition(async () => {
      const res = await deleteStaffAction(tenantId, s.id);
      if (res.error) toast.error(res.error);
      else toast.success(t("staff_deleted"));
    });
  }

  function serviceCountFor(staffId: string): number {
    return (servicesByStaff[staffId] ?? []).length;
  }

  const linkedForEditing = editing ? servicesByStaff[editing.id] ?? [] : [];

  return (
    <>
      <div className="mb-4 flex justify-end">
        <Button onClick={openNew}>
          <Plus className="size-4" />
          {t("add_person")}
        </Button>
      </div>

      {staff.length === 0 ? (
        <Card className="py-16 flex flex-col items-center text-center">
          <p className="font-medium">{t("empty_title")}</p>
          <p className="text-sm text-muted-foreground mt-1 max-w-md">
            {t("empty_subtitle")}
          </p>
          <Button onClick={openNew} className="mt-4">
            <Plus className="size-4" />
            {t("add")}
          </Button>
        </Card>
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("col_name")}</TableHead>
                <TableHead>{t("col_email")}</TableHead>
                <TableHead>{t("col_role")}</TableHead>
                <TableHead>{t("col_services")}</TableHead>
                <TableHead>{t("col_status")}</TableHead>
                <TableHead className="w-24" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {staff.map((s) => {
                const count = serviceCountFor(s.id);
                return (
                  <TableRow key={s.id}>
                    <TableCell className="font-medium">{s.name}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {s.email ?? "—"}
                    </TableCell>
                    <TableCell className="text-sm">
                      {s.role ?? <span className="text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell className="text-sm">
                      {count > 0 ? (
                        t("service_count", { count })
                      ) : (
                        <span className="text-muted-foreground">{t("none")}</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {s.active ? (
                        <Badge variant="success">{t("active")}</Badge>
                      ) : (
                        <Badge variant="muted">{t("inactive")}</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="icon" onClick={() => openEdit(s)}>
                          <Pencil className="size-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-muted-foreground hover:text-destructive"
                          onClick={() => handleDelete(s)}
                          disabled={pending}
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Card>
      )}

      <StaffFormDialog
        open={open}
        onClose={() => setOpen(false)}
        tenantId={tenantId}
        staff={editing}
        allServices={allServices}
        linkedServiceIds={linkedForEditing}
      />
    </>
  );
}

function StaffFormDialog({
  open,
  onClose,
  tenantId,
  staff,
  allServices,
  linkedServiceIds,
}: {
  open: boolean;
  onClose: () => void;
  tenantId: string;
  staff: StaffRow | null;
  allServices: ServiceOption[];
  linkedServiceIds: string[];
}) {
  const t = useTranslations("staff");
  const isEdit = !!staff;
  const [state, action, pending] = useActionState(
    isEdit ? updateStaffAction : createStaffAction,
    initial,
  );

  useEffect(() => {
    if (state.error) toast.error(state.error);
    if (state.success) {
      toast.success(isEdit ? t("staff_updated") : t("staff_created"));
      onClose();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, isEdit, onClose]);

  const linkedSet = new Set(linkedServiceIds);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? t("edit_person") : t("add_person")}</DialogTitle>
          <DialogDescription>
            {t("form_description")}
          </DialogDescription>
        </DialogHeader>

        <form action={action} className="space-y-4">
          <input type="hidden" name="tenant_id" value={tenantId} />
          {staff ? <input type="hidden" name="id" value={staff.id} /> : null}

          <div className="space-y-2">
            <Label htmlFor="name">{t("full_name")}</Label>
            <Input id="name" name="name" defaultValue={staff?.name ?? ""} required />
          </div>

          <div className="space-y-2">
            <Label htmlFor="email">{t("col_email")}</Label>
            <Input
              id="email"
              name="email"
              type="email"
              defaultValue={staff?.email ?? ""}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="role">{t("col_role")}</Label>
            <Input
              id="role"
              name="role"
              placeholder={t("role_placeholder")}
              defaultValue={staff?.role ?? ""}
            />
          </div>

          <div className="space-y-2">
            <Label>{t("services_offered")}</Label>
            {allServices.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                {t("no_services_yet")}
              </p>
            ) : (
              <div className="rounded-md border border-input divide-y divide-border max-h-48 overflow-y-auto">
                {allServices.map((s) => (
                  <label
                    key={s.id}
                    className="flex items-center gap-2 px-3 py-2 text-sm cursor-pointer hover:bg-muted/50"
                  >
                    <input
                      type="checkbox"
                      name="service_ids"
                      value={s.id}
                      defaultChecked={linkedSet.has(s.id)}
                      className="rounded border-input"
                    />
                    <span className={s.active ? "" : "text-muted-foreground"}>
                      {s.name} · {t("minutes_short", { count: s.duration_min })}
                      {s.active ? "" : ` ${t("inactive_suffix")}`}
                    </span>
                  </label>
                ))}
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              {t("agent_assigns_marked_services")}
            </p>
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="active"
              defaultChecked={staff?.active ?? true}
              className="rounded border-input"
            />
            {t("active_staff_label")}
          </label>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>
              {t("cancel")}
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? t("saving") : isEdit ? t("save") : t("create")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
