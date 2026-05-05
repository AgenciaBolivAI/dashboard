import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getTenantBySlug } from "@/lib/tenant";
import { AgentForm } from "./agent-form";

export default async function AgentSettingsPage({
  params,
}: {
  params: Promise<{ tenantSlug: string }>;
}) {
  const { tenantSlug } = await params;
  const tenant = await getTenantBySlug(tenantSlug);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Personalidad del agente</CardTitle>
          <CardDescription>
            Edita la plantilla del prompt y las variables que se inyectan en cada conversación.
            El prompt acepta marcadores tipo <code>{`{{variable}}`}</code> que se reemplazan con
            los valores de abajo.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <AgentForm
            tenantId={tenant.id}
            promptTemplate={tenant.prompt_template ?? ""}
            promptVariables={tenant.prompt_variables ?? {}}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Variables disponibles automáticamente</CardTitle>
          <CardDescription>
            Estos valores se inyectan en cada conversación sin necesidad de
            configurarlos. Úsalos en tu prompt con la sintaxis{" "}
            <code>{`{{nombre}}`}</code>.
          </CardDescription>
        </CardHeader>
        <CardContent className="text-sm">
          <ul className="space-y-1.5 text-muted-foreground">
            <li><code className="text-foreground">{"{{user_name}}"}</code> — nombre del cliente que está hablando</li>
            <li><code className="text-foreground">{"{{user_facts}}"}</code> — resumen de conversaciones previas con ese cliente</li>
            <li><code className="text-foreground">{"{{current_datetime}}"}</code> — fecha y hora actual en la zona horaria del negocio</li>
            <li><code className="text-foreground">{"{{current_date}}"}</code> — fecha actual</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
