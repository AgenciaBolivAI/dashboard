import { z } from "zod";
import { createServiceClient } from "@/lib/supabase/service";
import type { ToolDef } from "./index";

const schema = z.object({});

export const getBusinessInfo: ToolDef<z.infer<typeof schema>> = {
  name: "get_business_info",
  description:
    "Get the business's services catalog, hours, contact info, and tax/legal data. Call this at the start of any conversation that involves booking or pricing so you know what's offered. Idempotent — safe to call multiple times.",
  schema,
  parametersJsonSchema: {
    type: "object",
    properties: {},
  },
  async handler(_input, ctx) {
    const supabase = createServiceClient();
    const [tenantRes, servicesRes] = await Promise.all([
      supabase
        .from("tenants")
        .select(
          "name, language, timezone, support_email, support_whatsapp, whatsapp_number, address_line1, address_city, address_country, invoice_default_currency",
        )
        .eq("id", ctx.tenantId)
        .maybeSingle(),
      supabase
        .from("services")
        .select("id, name, description, price_amount, price_currency, duration_min, category")
        .eq("tenant_id", ctx.tenantId)
        .eq("active", true)
        .order("duration_min"),
    ]);

    const tenant = tenantRes.data as
      | {
          name: string;
          language: string;
          timezone: string;
          support_email: string | null;
          support_whatsapp: string | null;
          whatsapp_number: string | null;
          address_line1: string | null;
          address_city: string | null;
          address_country: string | null;
          invoice_default_currency: string;
        }
      | null;
    if (!tenant) {
      return { ok: false, error: "tenant not found" };
    }
    const services = (servicesRes.data ?? []) as Array<{
      id: string;
      name: string;
      description: string | null;
      price_amount: number | null;
      price_currency: string | null;
      duration_min: number;
      category: string | null;
    }>;

    return {
      ok: true,
      data: {
        business_name: tenant.name,
        language: tenant.language,
        timezone: tenant.timezone,
        currency: tenant.invoice_default_currency,
        contact: {
          email: tenant.support_email,
          whatsapp: tenant.support_whatsapp,
          whatsapp_business: tenant.whatsapp_number,
        },
        address: [tenant.address_line1, tenant.address_city, tenant.address_country]
          .filter(Boolean)
          .join(", ") || null,
        services_catalog: services.map((s) => ({
          service_id: s.id,
          name: s.name,
          description: s.description,
          duration_minutes: s.duration_min,
          price: s.price_amount,
          currency: s.price_currency ?? tenant.invoice_default_currency,
          category: s.category,
        })),
      },
    };
  },
};
