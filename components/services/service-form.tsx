"use client";

import { useActionState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  createServiceAction,
  updateServiceAction,
  type ServiceState,
} from "@/lib/actions/services";

const initial: ServiceState = { error: null };

export type ServiceRow = {
  id: string;
  name: string;
  description: string | null;
  price_amount: number | null;
  price_currency: string;
  duration_min: number;
  category: string | null;
  active: boolean;
};

export type StaffOption = { id: string; name: string; active: boolean };

export function ServiceFormDialog({
  open,
  onClose,
  tenantId,
  service,
  allStaff,
  linkedStaffIds,
}: {
  open: boolean;
  onClose: () => void;
  tenantId: string;
  service: ServiceRow | null;
  allStaff: StaffOption[];
  linkedStaffIds: string[];
}) {
  const t = useTranslations("services");
  const isEdit = !!service;
  const [state, action, pending] = useActionState(
    isEdit ? updateServiceAction : createServiceAction,
    initial,
  );

  useEffect(() => {
    if (state.error) toast.error(state.error);
    if (state.success) {
      toast.success(isEdit ? t("service_updated") : t("service_created"));
      onClose();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, isEdit, onClose]);

  const linkedSet = new Set(linkedStaffIds);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? t("edit_service") : t("new_service")}</DialogTitle>
          <DialogDescription>
            {t("form_description")}
          </DialogDescription>
        </DialogHeader>

        <form action={action} className="space-y-4">
          <input type="hidden" name="tenant_id" value={tenantId} />
          {service ? <input type="hidden" name="id" value={service.id} /> : null}

          <Field
            label={t("name")}
            name="name"
            defaultValue={service?.name ?? ""}
            required
            placeholder={t("name_placeholder")}
          />

          <div className="space-y-2">
            <Label htmlFor="description">{t("description")}</Label>
            <textarea
              id="description"
              name="description"
              defaultValue={service?.description ?? ""}
              rows={2}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              placeholder={t("description_placeholder")}
            />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2 space-y-2">
              <Label htmlFor="price_amount">{t("price")}</Label>
              <Input
                id="price_amount"
                name="price_amount"
                type="number"
                step="0.01"
                min="0"
                defaultValue={service?.price_amount ?? ""}
                placeholder="150.00"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="price_currency">{t("currency")}</Label>
              <Input
                id="price_currency"
                name="price_currency"
                defaultValue={service?.price_currency ?? "BOB"}
                maxLength={8}
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field
              label={t("duration_min")}
              name="duration_min"
              type="number"
              min="5"
              max="600"
              defaultValue={service?.duration_min ?? 30}
              required
            />
            <Field
              label={t("category")}
              name="category"
              defaultValue={service?.category ?? ""}
              placeholder={t("category_placeholder")}
            />
          </div>

          <div className="space-y-2">
            <Label>{t("staff_offering_service")}</Label>
            {allStaff.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                {t("no_staff_yet")}
              </p>
            ) : (
              <div className="rounded-md border border-input divide-y divide-border max-h-48 overflow-y-auto">
                {allStaff.map((s) => (
                  <label
                    key={s.id}
                    className="flex items-center gap-2 px-3 py-2 text-sm cursor-pointer hover:bg-muted/50"
                  >
                    <input
                      type="checkbox"
                      name="staff_ids"
                      value={s.id}
                      defaultChecked={linkedSet.has(s.id)}
                      className="rounded border-input"
                    />
                    <span className={s.active ? "" : "text-muted-foreground"}>
                      {s.name}
                      {s.active ? "" : ` ${t("inactive_suffix")}`}
                    </span>
                  </label>
                ))}
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              {t("agent_offers_marked_staff")}
            </p>
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="active"
              defaultChecked={service?.active ?? true}
              className="rounded border-input"
            />
            {t("active_service_label")}
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

function Field({
  label,
  ...rest
}: { label: string } & React.ComponentProps<typeof Input>) {
  return (
    <div className="space-y-2">
      <Label htmlFor={rest.name as string}>{label}</Label>
      <Input id={rest.name as string} {...rest} />
    </div>
  );
}
