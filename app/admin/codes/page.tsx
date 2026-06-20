import { listLifetimeCodes } from "@/lib/billing/lifetime-codes";
import { LifetimeCodesManager } from "@/components/admin/lifetime-codes-manager";

// Codes live in Stripe — always fetch fresh so redemption counts are current.
export const dynamic = "force-dynamic";

export default async function AdminCodesPage() {
  // Access is gated by the /admin layout (requireBolivAIAdmin).
  const codes = await listLifetimeCodes();
  return (
    <div className="p-6 md:p-8 max-w-5xl">
      <h1 className="mb-1 text-2xl font-display font-extrabold tracking-tight">Códigos de descuento</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        Códigos para la tarifa de Miembro Fundador ($40). Gestionados de forma nativa en Stripe (cupón
        + código promocional) — con límites de uso y vencimiento.
      </p>
      <LifetimeCodesManager codes={codes} />
    </div>
  );
}
