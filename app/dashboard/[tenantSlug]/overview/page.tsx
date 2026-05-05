import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getTenantBySlug } from "@/lib/tenant";
import { getPlan, isOverConversationsCap } from "@/lib/plans";
import { getTenantOverviewMetrics } from "@/lib/queries/metrics";

export default async function OverviewPage({
  params,
}: {
  params: Promise<{ tenantSlug: string }>;
}) {
  const { tenantSlug } = await params;
  const tenant = await getTenantBySlug(tenantSlug);
  const plan = getPlan(tenant.plan);
  const m = await getTenantOverviewMetrics(tenant.id);

  const overCap = isOverConversationsCap(plan, m.conversations);
  const capDisplay =
    plan.conversationsCap === -1 ? "ilimitadas" : `${plan.conversationsCap.toLocaleString("es")}`;

  return (
    <div className="p-6 md:p-8 max-w-6xl">
      <div className="mb-8 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-display font-extrabold tracking-tight">
            Resumen
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Plan {plan.name} · {tenant.industry ?? "general"} · {tenant.language}
          </p>
        </div>
        {overCap ? (
          <Badge variant="warning">Cap de conversaciones alcanzado</Badge>
        ) : null}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          label="Conversaciones (mes)"
          value={m.conversations.toLocaleString("es")}
          hint={
            plan.conversationsCap === -1
              ? "ilimitadas"
              : `${m.conversations.toLocaleString("es")} / ${capDisplay}`
          }
        />
        <KpiCard
          label="Leads capturados"
          value={m.leads.toLocaleString("es")}
          hint="Este mes"
        />
        <KpiCard
          label="Reservas confirmadas"
          value={m.reservations.toLocaleString("es")}
          hint="Próximas en el mes"
        />
        <KpiCard
          label="Mensajes procesados"
          value={m.messages.toLocaleString("es")}
          hint="Entrantes + salientes"
        />
      </div>

      <Card className="mt-8">
        <CardHeader>
          <CardTitle>Próximos pasos</CardTitle>
          <CardDescription>
            Termina la configuración para que tu agente empiece a trabajar.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="text-sm space-y-2 text-muted-foreground">
            <li>• Conecta una instancia de Evolution API en Ajustes → Integraciones</li>
            <li>• Sube tu base de conocimiento (FAQs y precios) en Conocimiento</li>
            <li>• Define horarios y personal en Personal y Calendario</li>
            <li>• Personaliza el prompt de tu agente en Ajustes → Agente</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}

function KpiCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <Card>
      <CardContent className="pt-6">
        <p className="text-xs uppercase tracking-wider text-muted-foreground">
          {label}
        </p>
        <p className="mt-2 font-display text-3xl font-extrabold tracking-tight">
          {value}
        </p>
        {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
      </CardContent>
    </Card>
  );
}
