import { z } from "zod";

/**
 * Tenant provisioning schema — extracted to a PLAIN module (no "use server").
 * A "use server" file may only export async functions; exporting this zod schema
 * (its `.transform()`/`.or()` callbacks read as non-async server actions) from
 * lib/actions/onboarding.ts broke the production build. Keep it here so both the
 * action (provisionTenant / provisionTenantAction) and the chat flow can import
 * it without violating the directive.
 */

export const LANGUAGES = ["es", "en", "pt"] as const;

export const provisionSchema = z.object({
  company_name: z.string().trim().min(2, "Mínimo 2 caracteres").max(80),
  industry: z.string().trim().min(2).max(80),
  country: z.string().trim().length(2, "Código ISO de 2 letras").transform((s) => s.toUpperCase()),
  timezone: z.string().trim().min(3).max(80).default("America/La_Paz"),
  language: z.enum(LANGUAGES).default("es"),
  whatsapp_number: z
    .string()
    .trim()
    .regex(/^\+?[0-9]{8,16}$/, "Número con código país, ej. +5217712345678")
    .transform((s) => s.replace(/^\+/, "")),
  primary_color: z
    .string()
    .trim()
    .regex(/^#[0-9a-f]{6}$/i, "Color hex (#RRGGBB)")
    .default("#00e5a0"),
  accent_color: z
    .string()
    .trim()
    .regex(/^#[0-9a-f]{6}$/i, "Color hex (#RRGGBB)")
    .default("#00b87d"),
  logo_url: z
    .string()
    .trim()
    .url("URL inválida")
    .optional()
    .or(z.literal("").transform(() => undefined)),
});

/** Validated provisioning input — the OUTPUT of provisionSchema (defaults/transforms applied). */
export type ProvisionInput = z.infer<typeof provisionSchema>;
