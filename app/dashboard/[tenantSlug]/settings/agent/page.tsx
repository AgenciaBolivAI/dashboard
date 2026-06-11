import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getTenantBySlug } from "@/lib/tenant";
import { getTranslations } from "next-intl/server";
import { AgentForm } from "./agent-form";

export default async function AgentSettingsPage({
  params,
}: {
  params: Promise<{ tenantSlug: string }>;
}) {
  const { tenantSlug } = await params;
  const tenant = await getTenantBySlug(tenantSlug);
  const t = await getTranslations("settings_agent");

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>{t("personality_title")}</CardTitle>
          <CardDescription>
            {t.rich("personality_description", {
              variable: () => <code>{`{{variable}}`}</code>,
            })}
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
          <CardTitle>{t("auto_vars_title")}</CardTitle>
          <CardDescription>
            {t.rich("auto_vars_description", {
              code: () => <code>{`{{nombre}}`}</code>,
            })}
          </CardDescription>
        </CardHeader>
        <CardContent className="text-sm">
          <ul className="space-y-1.5 text-muted-foreground">
            <li><code className="text-foreground">{"{{user_name}}"}</code> — {t("var_user_name")}</li>
            <li><code className="text-foreground">{"{{user_facts}}"}</code> — {t("var_user_facts")}</li>
            <li><code className="text-foreground">{"{{current_datetime}}"}</code> — {t("var_current_datetime")}</li>
            <li><code className="text-foreground">{"{{current_date}}"}</code> — {t("var_current_date")}</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
