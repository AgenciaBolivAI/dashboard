"use client";

import { useState, useTransition } from "react";
import { useTranslations, useLocale } from "next-intl";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  ServiceFormDialog,
  type ServiceRow,
  type StaffOption,
} from "./service-form";
import {
  deleteServiceAction,
  toggleServiceActiveAction,
} from "@/lib/actions/services";

export function ServicesManager({
  tenantId,
  services,
  allStaff,
  staffByService,
}: {
  tenantId: string;
  services: ServiceRow[];
  allStaff: StaffOption[];
  staffByService: Record<string, string[]>;
}) {
  const t = useTranslations("services");
  const locale = useLocale();
  const [editing, setEditing] = useState<ServiceRow | null>(null);
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  function openNew() {
    setEditing(null);
    setOpen(true);
  }

  function openEdit(s: ServiceRow) {
    setEditing(s);
    setOpen(true);
  }

  function handleDelete(s: ServiceRow) {
    if (!confirm(t("delete_confirm", { name: s.name }))) return;
    startTransition(async () => {
      const res = await deleteServiceAction(tenantId, s.id);
      if (res.error) toast.error(res.error);
      else toast.success(t("service_deleted"));
    });
  }

  function handleToggle(s: ServiceRow) {
    startTransition(async () => {
      const res = await toggleServiceActiveAction(tenantId, s.id, !s.active);
      if (res.error) toast.error(res.error);
    });
  }

  function staffNamesFor(serviceId: string): string {
    const ids = staffByService[serviceId] ?? [];
    if (ids.length === 0) return "—";
    const names = allStaff
      .filter((s) => ids.includes(s.id))
      .map((s) => s.name);
    return names.join(", ");
  }

  const linkedForEditing = editing ? staffByService[editing.id] ?? [] : [];

  return (
    <>
      <div className="mb-4 flex justify-end">
        <Button onClick={openNew}>
          <Plus className="size-4" />
          {t("new_service")}
        </Button>
      </div>

      {services.length === 0 ? (
        <Card className="py-16 flex flex-col items-center text-center">
          <p className="font-medium">{t("empty_title")}</p>
          <p className="text-sm text-muted-foreground mt-1 max-w-md">
            {t("empty_subtitle")}
          </p>
          <Button onClick={openNew} className="mt-4">
            <Plus className="size-4" />
            {t("create_first")}
          </Button>
        </Card>
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("col_service")}</TableHead>
                <TableHead>{t("col_category")}</TableHead>
                <TableHead className="text-right">{t("col_price")}</TableHead>
                <TableHead>{t("col_duration")}</TableHead>
                <TableHead>{t("col_staff")}</TableHead>
                <TableHead>{t("col_status")}</TableHead>
                <TableHead className="w-24" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {services.map((s) => (
                <TableRow key={s.id}>
                  <TableCell>
                    <div className="font-medium">{s.name}</div>
                    {s.description ? (
                      <div className="text-xs text-muted-foreground line-clamp-1">
                        {s.description}
                      </div>
                    ) : null}
                  </TableCell>
                  <TableCell className="text-sm">
                    {s.category ?? <span className="text-muted-foreground">—</span>}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {s.price_amount !== null
                      ? `${s.price_amount.toLocaleString(locale, { minimumFractionDigits: 2 })} ${s.price_currency}`
                      : <span className="text-muted-foreground">—</span>}
                  </TableCell>
                  <TableCell className="text-sm">{t("minutes_short", { count: s.duration_min })}</TableCell>
                  <TableCell className="text-xs text-muted-foreground max-w-[12rem] truncate">
                    {staffNamesFor(s.id)}
                  </TableCell>
                  <TableCell>
                    <button
                      onClick={() => handleToggle(s)}
                      disabled={pending}
                      className="text-left"
                    >
                      {s.active ? (
                        <Badge variant="success">{t("active")}</Badge>
                      ) : (
                        <Badge variant="muted">{t("inactive")}</Badge>
                      )}
                    </button>
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => openEdit(s)}
                      >
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
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      <ServiceFormDialog
        open={open}
        onClose={() => setOpen(false)}
        tenantId={tenantId}
        service={editing}
        allStaff={allStaff}
        linkedStaffIds={linkedForEditing}
      />
    </>
  );
}
