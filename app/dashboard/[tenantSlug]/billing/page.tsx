import { Coins, TrendingDown, TrendingUp, CreditCard, History } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getTenantBySlug } from "@/lib/tenant";
import { getBalance, listTransactions } from "@/lib/billing/credits";
import { TopupPicker } from "@/components/billing/topup-picker";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

const TX_TYPE_LABEL: Record<string, string> = {
  top_up: "Recarga",
  usage: "Uso",
  reservation: "Reserva (en curso)",
  release: "Cierre de llamada",
  refund: "Reembolso",
  bonus: "Bono",
  reversal: "Reverso",
  manual_adjust: "Ajuste manual",
};

const TX_TYPE_STYLE: Record<string, string> = {
  top_up: "border-green-500/40 bg-green-500/10 text-green-600",
  usage: "border-destructive/30 text-destructive",
  reservation: "border-amber-500/30 text-amber-600",
  release: "border-amber-500/30 text-amber-600",
  refund: "border-blue-500/30 text-blue-600",
  bonus: "border-primary/40 bg-primary/10 text-primary",
  reversal: "border-muted-foreground/30 text-muted-foreground",
  manual_adjust: "border-purple-500/30 text-purple-600",
};

const ACTION_KEY_LABEL: Record<string, string> = {
  "whatsapp.agent_turn": "WhatsApp · turno",
  "voice.inbound.minute": "Voz entrante · minuto",
  "voice.inbound.reservation": "Voz entrante · reserva",
  "voice.outbound.minute": "Voz saliente · minuto",
  "voice.outbound.connected_call": "Llamada conectada",
  "voice.outbound.no_answer": "Sin respuesta",
  "content.draft_per_platform": "Contenido · draft",
  "content.branded_image": "Contenido · imagen",
  "marketing.lead_scraped_diy": "AIMA · lead DIY",
  "marketing.lead_scraped_apollo": "AIMA · lead Apollo",
  "marketing.cold_email_sent": "AIMA · cold email",
  "calendar.appointment_booked": "Reserva agendada",
  "invoice.sent": "Factura enviada",
  "video.meeting_minute": "Reunión video · min",
  "knowledge.kb_sync": "KB sync",
};

export default async function BillingPage({
  params,
  searchParams,
}: {
  params: Promise<{ tenantSlug: string }>;
  searchParams: Promise<{ topup?: string }>;
}) {
  const { tenantSlug } = await params;
  const { topup } = await searchParams;
  const tenant = await getTenantBySlug(tenantSlug);

  const [balance, transactions] = await Promise.all([
    getBalance(tenant.id),
    listTransactions(tenant.id, 50),
  ]);

  return (
    <div className="p-6 md:p-8 max-w-5xl">
      <div className="mb-6">
        <h1 className="text-3xl font-display font-extrabold tracking-tight flex items-center gap-2">
          <Coins className="size-7 text-primary" />
          Facturación
        </h1>
        <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
          Tus agentes (WhatsApp, voz, contenido, marketing) gastan créditos
          por uso. Recarga cuando quieras — los créditos no expiran.
        </p>
      </div>

      {topup === "success" && (
        <div className="mb-4 rounded-md border border-green-500/40 bg-green-500/10 px-4 py-3 text-sm text-green-700 dark:text-green-400">
          ✓ Pago confirmado. Tus créditos se acreditarán en segundos
          (Stripe los procesa vía webhook). Refresca si no ves el balance
          actualizado en un minuto.
        </div>
      )}
      {topup === "canceled" && (
        <div className="mb-4 rounded-md border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-700 dark:text-amber-400">
          Recarga cancelada. No se cobró nada.
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <Card className="p-5 md:col-span-2">
          <div className="flex items-baseline justify-between gap-2">
            <h2 className="text-sm uppercase tracking-wider text-muted-foreground">
              Balance disponible
            </h2>
            {balance?.is_zero && (
              <Badge variant="outline" className="text-xs border-destructive/40 text-destructive">
                Sin créditos · agentes pausados
              </Badge>
            )}
            {balance?.is_low && !balance.is_zero && (
              <Badge variant="outline" className="text-xs border-amber-500/40 text-amber-600">
                Balance bajo
              </Badge>
            )}
          </div>
          <p className={cn(
            "mt-2 text-5xl font-display font-extrabold",
            balance?.is_zero && "text-destructive",
            balance?.is_low && !balance.is_zero && "text-amber-600",
          )}>
            ${((balance?.available_credits ?? 0) / 100).toFixed(2)}
          </p>
          <p className="text-sm text-muted-foreground mt-1">
            {(balance?.available_credits ?? 0).toLocaleString()} créditos disponibles
            {(balance?.reserved_credits ?? 0) > 0 && (
              <> · {balance?.reserved_credits.toLocaleString()} reservados en llamadas activas</>
            )}
          </p>
        </Card>

        <Card className="p-5 flex flex-col gap-3">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <TrendingDown className="size-3.5 text-destructive" />
            <span>Total gastado</span>
          </div>
          <p className="text-2xl font-display font-bold">
            {(balance?.lifetime_spent_credits ?? 0).toLocaleString()}
          </p>
          <div className="flex items-center gap-2 text-xs text-muted-foreground mt-2">
            <TrendingUp className="size-3.5 text-green-600" />
            <span>Total recargado</span>
          </div>
          <p className="text-2xl font-display font-bold">
            ${((balance?.lifetime_topped_up_cents ?? 0) / 100).toFixed(2)}
          </p>
        </Card>
      </div>

      <div className="mb-8">
        <TopupPicker tenantId={tenant.id} tenantSlug={tenantSlug} />
      </div>

      <div>
        <h2 className="text-sm uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-2">
          <History className="size-4" />
          Historial reciente
        </h2>
        {transactions.length === 0 ? (
          <Card className="py-12 flex flex-col items-center text-center">
            <CreditCard className="size-10 text-muted-foreground mb-3" />
            <p className="text-sm text-muted-foreground">
              No hay movimientos aún. Tu primera recarga aparecerá aquí.
            </p>
          </Card>
        ) : (
          <Card className="divide-y">
            {transactions.map((tx) => {
              const isCredit = tx.credits_delta > 0;
              return (
                <div key={tx.id} className="flex items-center justify-between px-4 py-3 gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge
                        variant="outline"
                        className={cn("text-xs", TX_TYPE_STYLE[tx.type])}
                      >
                        {TX_TYPE_LABEL[tx.type] ?? tx.type}
                      </Badge>
                      {tx.action_key && (
                        <span className="text-xs text-muted-foreground">
                          {ACTION_KEY_LABEL[tx.action_key] ?? tx.action_key}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      {new Date(tx.created_at).toLocaleString("es-BO", {
                        dateStyle: "medium",
                        timeStyle: "short",
                      })}
                    </p>
                  </div>
                  <div className="text-right">
                    <p
                      className={cn(
                        "font-mono font-semibold text-sm",
                        isCredit ? "text-green-600" : tx.credits_delta < 0 ? "text-destructive" : "text-muted-foreground",
                      )}
                    >
                      {isCredit ? "+" : ""}
                      {tx.credits_delta.toLocaleString()}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      balance {tx.balance_after.toLocaleString()}
                    </p>
                  </div>
                </div>
              );
            })}
          </Card>
        )}
      </div>
    </div>
  );
}
