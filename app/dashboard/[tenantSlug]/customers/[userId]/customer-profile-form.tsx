"use client";

import { useActionState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Star, User, Phone, Mail, Building2, Contact } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import {
  updateCustomerProfileAction,
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
  const [state, action, pending] = useActionState(
    updateCustomerProfileAction,
    initial,
  );

  useEffect(() => {
    if (state.error) toast.error(state.error);
    if (state.success) {
      try {
        toast.success(t("profile_saved"));
      } catch {
        toast.success("Perfil actualizado");
      }
    }
  }, [state, t]);

  const tx = (key: string, fallback: string) => {
    try {
      return t(key);
    } catch {
      return fallback;
    }
  };

  return (
    <form action={action} className="space-y-5">
      <input type="hidden" name="tenant_id" value={tenantId} />
      <input type="hidden" name="user_id" value={userId} />

      {/* Basic info section */}
      <div className="space-y-3">
        <p className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">
          {tx("basic_info_section", "Información de contacto")}
        </p>

        <div className="space-y-1.5">
          <Label htmlFor="name" className="text-xs flex items-center gap-1.5">
            <User className="size-3" />
            {tx("field_name", "Nombre")}
          </Label>
          <Input
            id="name"
            name="name"
            defaultValue={name ?? ""}
            placeholder={tx("field_name_placeholder", "María López")}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="whatsapp_number" className="text-xs flex items-center gap-1.5">
            <Phone className="size-3" />
            {tx("field_phone", "Teléfono / WhatsApp")}
          </Label>
          <Input
            id="whatsapp_number"
            name="whatsapp_number"
            type="tel"
            defaultValue={whatsappNumber ?? ""}
            placeholder="+5491134567890"
          />
          <p className="text-[11px] text-muted-foreground">
            {tx("field_phone_hint", "Formato E.164 — incluye código de país. Sin guiones ni espacios.")}
          </p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="email" className="text-xs flex items-center gap-1.5">
            <Mail className="size-3" />
            {tx("field_email", "Email")}
          </Label>
          <Input
            id="email"
            name="email"
            type="email"
            defaultValue={email ?? ""}
            placeholder="cliente@ejemplo.com"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="business_name" className="text-xs flex items-center gap-1.5">
            <Building2 className="size-3" />
            {tx("field_business_name", "Nombre del negocio")}
          </Label>
          <Input
            id="business_name"
            name="business_name"
            defaultValue={businessName ?? ""}
            placeholder={tx("field_business_name_placeholder", "Hostal Andino")}
          />
          <p className="text-[11px] text-muted-foreground">
            {tx("field_business_name_hint", "Solo si el cliente es una empresa. Dejá vacío para clientes individuales.")}
          </p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="point_of_contact" className="text-xs flex items-center gap-1.5">
            <Contact className="size-3" />
            {tx("field_point_of_contact", "Persona de contacto")}
          </Label>
          <Input
            id="point_of_contact"
            name="point_of_contact"
            defaultValue={pointOfContact ?? ""}
            placeholder={tx("field_point_of_contact_placeholder", "María López, Gerente")}
          />
          <p className="text-[11px] text-muted-foreground">
            {tx("field_point_of_contact_hint", "Útil para B2B: la persona específica con la que hablás dentro de la empresa.")}
          </p>
        </div>
      </div>

      <div className="border-t border-border pt-4 space-y-3">
        <p className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">
          {tx("flags_section", "Marca y notas")}
        </p>

        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input
            type="checkbox"
            name="is_vip"
            defaultChecked={isVip}
            className="h-4 w-4 rounded border-input cursor-pointer"
          />
          <Star className="size-4 text-muted-foreground" />
          <span>{tx("mark_as_vip", "Marcar como VIP")}</span>
        </label>

        <div className="space-y-1.5">
          <Label htmlFor="tenant_notes" className="text-xs">
            {tx("internal_notes_title", "Notas privadas")}
          </Label>
          <textarea
            id="tenant_notes"
            name="tenant_notes"
            defaultValue={tenantNotes ?? ""}
            rows={5}
            placeholder={tx(
              "notes_placeholder",
              "Alergias, preferencias, historial, lo que sea útil para tu equipo…",
            )}
            className={cn(
              "flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm",
              "ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 resize-y",
            )}
          />
        </div>
      </div>

      <Button type="submit" disabled={pending} className="w-full">
        {pending ? tx("saving", "Guardando…") : tx("save_profile", "Guardar cambios")}
      </Button>
    </form>
  );
}
