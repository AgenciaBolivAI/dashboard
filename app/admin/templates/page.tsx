import { Sparkles, Plug } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { TEMPLATES, GATEWAYS } from "@/lib/templates";
import { createServiceClient } from "@/lib/supabase/service";

export default async function AdminTemplatesPage() {
  const t = await getTranslations("admin_templates");
  // Count tenants per template + per gateway so admin sees usage
  const svc = createServiceClient();
  const { data: tenants } = await svc
    .from("tenants")
    .select("workflow_template, gateway");

  const tplCounts = new Map<string, number>();
  const gwCounts = new Map<string, number>();
  for (const row of (tenants ?? []) as Array<{
    workflow_template: string;
    gateway: string;
  }>) {
    tplCounts.set(row.workflow_template, (tplCounts.get(row.workflow_template) ?? 0) + 1);
    gwCounts.set(row.gateway, (gwCounts.get(row.gateway) ?? 0) + 1);
  }

  return (
    <div className="p-6 md:p-8 max-w-6xl">
      <div className="mb-8">
        <h1 className="text-3xl font-display font-extrabold tracking-tight">
          {t("page_title")}
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          {t("page_subtitle")}
        </p>
      </div>

      <section className="mb-8">
        <div className="flex items-center gap-2 mb-4">
          <Sparkles className="size-4 text-primary" />
          <h2 className="font-display font-semibold">{t("agent_templates_heading")}</h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {TEMPLATES.map((tpl) => {
            const count = tplCounts.get(tpl.id) ?? 0;
            return (
              <Card key={tpl.id} className="flex flex-col">
                <CardHeader>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <CardTitle className="text-lg">{tpl.name}</CardTitle>
                      <CardDescription className="mt-0.5 capitalize">
                        {tpl.vertical}
                      </CardDescription>
                    </div>
                    {tpl.status === "available" ? (
                      <Badge variant="success">{t("badge_available")}</Badge>
                    ) : (
                      <Badge variant="muted">{t("badge_coming_soon")}</Badge>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="flex-1 space-y-3">
                  <p className="text-sm text-muted-foreground">{tpl.description}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {tpl.features.map((f) => (
                      <Badge key={f.id} variant="outline" className="text-[10px]">
                        {f.label}
                      </Badge>
                    ))}
                  </div>
                  <Separator />
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">
                      {t("supported_channels_label")}{" "}
                      <span className="font-mono text-foreground">
                        {tpl.supportedGateways.join(", ")}
                      </span>
                    </span>
                    <span className="text-muted-foreground">
                      {t("active_tenants_label")}{" "}
                      <span className="text-foreground font-medium">{count}</span>
                    </span>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </section>

      <section>
        <div className="flex items-center gap-2 mb-4">
          <Plug className="size-4 text-primary" />
          <h2 className="font-display font-semibold">{t("messaging_channels_heading")}</h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {GATEWAYS.map((g) => {
            const count = gwCounts.get(g.id) ?? 0;
            return (
              <Card key={g.id}>
                <CardHeader>
                  <div className="flex items-start justify-between gap-2">
                    <CardTitle className="text-base">{g.name}</CardTitle>
                    {g.status === "available" ? (
                      <Badge variant="success">{t("badge_active")}</Badge>
                    ) : (
                      <Badge variant="muted">{t("badge_soon")}</Badge>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="space-y-2">
                  <p className="text-sm text-muted-foreground">{g.description}</p>
                  <p className="text-xs text-muted-foreground pt-2 border-t border-border">
                    {t("tenants_using_label")}{" "}
                    <span className="text-foreground font-medium">{count}</span>
                  </p>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </section>
    </div>
  );
}
