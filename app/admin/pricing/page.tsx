import { Coins, Info } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { listCreditPricing } from "@/lib/queries/admin-pricing";
import { PricingRow } from "@/components/admin/pricing-row";

export const dynamic = "force-dynamic";

export default async function AdminPricingPage() {
  const rows = await listCreditPricing();

  const totalActions = rows.length;
  const profitable = rows.filter((r) => r.margin_micros > 0).length;
  const unprofitable = rows.filter((r) => r.margin_micros < 0).length;
  const vendorMismatches = rows.filter((r) => !r.vendor_sum_matches).length;

  return (
    <div className="p-6 md:p-8 max-w-7xl">
      <div className="mb-6">
        <h1 className="text-3xl font-display font-extrabold tracking-tight flex items-center gap-2">
          <Coins className="size-7 text-primary" />
          Precios por acción
        </h1>
        <p className="text-sm text-muted-foreground mt-1 max-w-3xl">
          Edita lo que cobramos por cada acción del agente (credits_per_unit) y
          lo que nos cuesta a nosotros (cost_per_unit_micros + breakdown por
          proveedor). Los cambios se reflejan inmediatamente en /admin/overview,
          /admin/usage, en el briefing matutino, y en el cálculo de margen de
          cada tenant.
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <Card className="p-4">
          <p className="text-xs uppercase tracking-wider text-muted-foreground">
            Acciones registradas
          </p>
          <p className="mt-1 font-display text-2xl font-extrabold">{totalActions}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs uppercase tracking-wider text-muted-foreground">
            Con margen positivo
          </p>
          <p className="mt-1 font-display text-2xl font-extrabold text-primary">
            {profitable}
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-xs uppercase tracking-wider text-muted-foreground">
            Con margen negativo
          </p>
          <p
            className={`mt-1 font-display text-2xl font-extrabold ${unprofitable > 0 ? "text-destructive" : "text-muted-foreground"}`}
          >
            {unprofitable}
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-xs uppercase tracking-wider text-muted-foreground">
            Vendor sum ≠ cost
          </p>
          <p
            className={`mt-1 font-display text-2xl font-extrabold ${vendorMismatches > 0 ? "text-amber-600" : "text-muted-foreground"}`}
          >
            {vendorMismatches}
          </p>
        </Card>
      </div>

      <Card className="p-4 mb-6 border-amber-500/30 bg-amber-500/5">
        <div className="flex gap-3">
          <Info className="size-5 text-amber-600 shrink-0 mt-0.5" />
          <div className="text-sm">
            <p className="font-medium">Unidades</p>
            <ul className="mt-1 text-muted-foreground space-y-0.5 list-disc ml-5 text-xs">
              <li>
                <code>credits_per_unit</code> — lo que cobramos al tenant en
                créditos. 1 crédito = $0.01 USD. Una respuesta WhatsApp a 5 cr =
                $0.05.
              </li>
              <li>
                <code>cost_per_unit_micros</code> — nuestro costo real con
                vendors. 1,000,000 micros = $1.00 USD. Una llamada inbound a
                200,000 micros = $0.20.
              </li>
              <li>
                <code>vendor_cost_micros</code> — desglose por vendor en JSON. La
                suma debería igualar <code>cost_per_unit_micros</code>; si no, te
                avisamos.
              </li>
            </ul>
          </div>
        </div>
      </Card>

      <Card className="overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-muted/50 border-b border-border text-xs">
              <th className="p-2 w-8" />
              <th className="p-2 text-left">Action key</th>
              <th className="p-2 text-right">Cobramos</th>
              <th className="p-2 text-right">USD</th>
              <th className="p-2 text-right">Costo</th>
              <th className="p-2 text-right">Margen</th>
              <th className="p-2 text-right w-32">Alerta</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={7} className="text-center text-sm text-muted-foreground py-8">
                  Sin precios configurados (esto no debería pasar)
                </td>
              </tr>
            ) : (
              rows.map((r) => <PricingRow key={r.action_key} row={r} />)
            )}
          </tbody>
        </table>
      </Card>

      <p className="text-xs text-muted-foreground mt-4 text-center">
        Tip: expande una fila para editar. Los cambios se guardan
        independientemente y se reflejan en tiempo real en todas las vistas
        admin.
      </p>
    </div>
  );
}
