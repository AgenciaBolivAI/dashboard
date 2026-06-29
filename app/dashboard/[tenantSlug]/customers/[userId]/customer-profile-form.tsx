"use client";

import { useActionState, useEffect, useTransition } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Star, User, Phone, Mail, Building2, Contact, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import {
  updateCustomerProfileAction,
  deleteCustomerAction,
  type CustomerActionState,
} from "@/lib/actions/customers";

const initial: CustomerActionState = { error: null };

export function CustomerProfileForm({
  tenantId,
  userId,
  isVip,
  tenantNotes,
  name,
  whatsappNumber,
  email,
  businessName,
  pointOfContact,
}: {
  tenantId: string;
  userId: string;
  isVip: boolean;
  tenantNotes: string | null;
  name: string | null;
  whatsappNumber: string | null;
  email: string | null;
  businessName: string | null;
  pointOfContact: string | null;
}) {
  const t = useTranslations("customers");
  const router = useRouter();
  const pathname = usePathname();
  const [state, action, pending] = useActionState(
    updateCustomerProfileAction,
    initial,
  );
  const [deleting, startDelete] = useTransition();

  useEffect(() => {
    if (state.error) toast.error(state.error);
    if (state.success) {
      toast.success(t("profile_saved"));
    }
  }, [state, t]);

  function handleDelete() {
    if (!confirm(t("confirm_delete_customer"))) return;
    startDelete(async () => {
      const res = await deleteCustomerAction(tenantId, userId);
      if (res.error) {
        toast.error(res.error);
        return;
      }
      toast.success(t("customer_deleted"));
      // Back to the customers list (parent of /customers/[userId])
      router.push(pathname.replace(/\/customers\/[^/]+$/, "/customers"));
      router.refresh();
    });
  }

  return (
    <>
    <form action={action} className="space-y-5">
      <input type="hidden" name="tenant_id" value={tenantId} />
      <input type="hidden" name="user_id" value={userId} />

      {/* Basic info section */}
      <div className="space-y-3">
        <p className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">
          {t("basic_info_section")}
        </p>

        <div className="space-y-1.5">
          <Label htmlFor="name" className="text-xs flex items-center gap-1.5">
            <User className="size-3" />
            {t("field_name")}
          </Label>
          <Input
            id="name"
            name="name"
            defaultValue={name ?? ""}
            placeholder={t("field_name_placeholder")}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="whatsapp_number" className="text-xs flex items-center gap-1.5">
            <Phone className="size-3" />
            {t("field_phone")}
          </Label>
          <Input
            id="whatsapp_number"
            name="whatsapp_number"
            type="tel"
            defaultValue={whatsappNumber ?? ""}
            placeholder="+5491134567890"
          />
          <p className="text-[11px] text-muted-foreground">
            {t("field_phone_hint")}
          </p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="email" className="text-xs flex items-center gap-1.5">
            <Mail className="size-3" />
            {t("field_email")}
          </Label>
          <Input
            id="email"
            name="email"
            type="email"
            defaultValue={email ?? ""}
            placeholder="name@example.com"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="business_name" className="text-xs flex items-center gap-1.5">
            <Building2 className="size-3" />
            {t("field_business_name")}
          </Label>
          <Input
            id="business_name"
            name="business_name"
            defaultValue={businessName ?? ""}
            placeholder={t("field_business_name_placeholder")}
          />
          <p className="text-[11px] text-muted-foreground">
            {t("field_business_name_hint")}
          </p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="point_of_contact" className="text-xs flex items-center gap-1.5">
            <Contact className="size-3" />
            {t("field_point_of_contact")}
          </Label>
          <Input
            id="point_of_contact"
            name="point_of_contact"
            defaultValue={pointOfContact ?? ""}
            placeholder={t("field_point_of_contact_placeholder")}
          />
          <p className="text-[11px] text-muted-foreground">
            {t("field_point_of_contact_hint")}
          </p>
        </div>
      </div>

      <div className="border-t border-border pt-4 space-y-3">
        <p className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">
          {t("flags_section")}
        </p>

        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input
            type="checkbox"
            name="is_vip"
            defaultChecked={isVip}
            className="h-4 w-4 rounded border-input cursor-pointer"
          />
          <Star className="size-4 text-muted-foreground" />
          <span>{t("mark_as_vip")}</span>
        </label>

        <div className="space-y-1.5">
          <Label htmlFor="tenant_notes" className="text-xs">
            {t("internal_notes_title")}
          </Label>
          <textarea
            id="tenant_notes"
            name="tenant_notes"
            defaultValue={tenantNotes ?? ""}
            rows={5}
            placeholder={t("notes_placeholder")}
            className={cn(
              "flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm",
              "ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 resize-y",
            )}
          />
        </div>
      </div>

      <Button type="submit" disabled={pending} className="w-full">
        {pending ? t("saving") : t("save_profile")}
      </Button>
    </form>

    <div className="mt-6 border-t border-destructive/30 pt-4">
      <p className="text-xs uppercase tracking-wider text-destructive/80 font-semibold mb-2">
        {t("danger_zone")}
      </p>
      <Button
        type="button"
        variant="outline"
        onClick={handleDelete}
        disabled={deleting}
        className="w-full gap-1.5 border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
      >
        <Trash2 className="size-4" />
        {deleting ? t("deleting") : t("delete_customer")}
      </Button>
      <p className="mt-2 text-[11px] text-muted-foreground">
        {t("delete_customer_hint")}
      </p>
    </div>
    </>
  );
}
