import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Phone, Mail, Globe, Tag, Calendar, ExternalLink } from "lucide-react";
import { getTranslations, getLocale } from "next-intl/server";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getTenantBySlug } from "@/lib/tenant";
import { requireUser, requireTenantAccess, isBolivAIAdmin } from "@/lib/auth";
import { getLeadById, getLeadCallHistory } from "@/lib/queries/leads";
import { getProspectResearch } from "@/lib/queries/prospect";
import { getActionCredits } from "@/lib/billing/credits";
import { ResearchCard } from "@/components/prospect/research-card";
import { ActivityTimeline, type ActivityItem } from "@/components/prospect/activity-timeline";
import { getCountryFromPhone, getStateFromMetadata, COUNTRY_BY_CODE } from "@/lib/leads-geo";
import { intentLabel, intentBadgeClass } from "@/lib/leads-intents";
import { LeadNotesEditor } from "@/components/leads/lead-notes-editor";
import { CallSandraButton } from "@/components/leads/call-sandra-button";
import { LeadStatusSelect } from "@/components/leads/lead-status-select";

export const dynamic = "force-dynamic";
// Allow the inline "Research with BOLIV" action room to run the web-search call.
export const maxDuration = 60;

const SOURCE_LABEL: Record<string, string> = {
  aima: "AIMA",
  whatsapp: "WhatsApp",
  manual: "Manual",
  voice: "Voice",
  webform: "Web form",
};

export default async function LeadDetailPage({
  params,
}: {
  params: Promise<{ tenantSlug: string; id: string }>;
}) {
  const { tenantSlug, id } = await params;
  const tenant = await getTenantBySlug(tenantSlug);
  await requireUser();
  await requireTenantAccess(tenant.id);

  const [lead, callHistory, research, isStaff, researchCost, t, tp, locale] = await Promise.all([
    getLeadById(tenant.id, id),
    getLeadCallHistory(tenant.id, id, 10),
    getProspectResearch(tenant.id, "lead", id),
    isBolivAIAdmin(),
    getActionCredits("research.prospect", 15),
    getTranslations("leads"),
    getTranslations("prospect"),
    getLocale(),
  ]);

  if (!lead) notFound();

  const country = getCountryFromPhone(lead.whatsapp_number);
  const state = getStateFromMetadata(lead.metadata);
  const meta = lead.metadata ?? {};
  const city = typeof meta.city === "string" ? meta.city : null;
  const vertical = typeof meta.vertical === "string" ? meta.vertical : null;
  const website = typeof meta.website === "string" ? meta.website : null;
  const sourceLabel = SOURCE_LABEL[lead.source ?? ""] ?? lead.source ?? "—";

  // Unified activity feed: lead creation + BOLIV research + every call, newest first.
  const activity: ActivityItem[] = [
    { kind: "created" as const, at: lead.created_at },
    ...(research?.status === "done" && research.generated_at
      ? [{ kind: "research" as const, at: research.generated_at, headline: research.structured?.headline ?? null }]
      : []),
    ...callHistory
      .filter((c) => c.started_at)
      .map((c) => ({
        kind: "call" as const,
        at: c.started_at,
        conversationId: c.conversation_id ?? "",
        title: c.title,
        direction: c.direction,
        outcome: c.call_successful,
        durationSecs: c.duration_secs,
      })),
  ].sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());

  return (
    <div className="p-6 md:p-8 max-w-5xl">
      <Button asChild variant="ghost" size="sm" className="mb-3 -ml-2">
        <Link href={`/dashboard/${tenantSlug}/leads`}>
          <ArrowLeft className="size-4" />
          {(() => {
            try { return t("back_to_leads"); } catch { return "Volver a leads"; }
          })()}
        </Link>
      </Button>

      {/* Header */}
      <div className="mb-6 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-display font-extrabold tracking-tight flex items-center gap-2">
            {country ? <span title={country.name}>{country.flag}</span> : null}
            {lead.name ?? "—"}
          </h1>
          <div className="flex flex-wrap gap-3 mt-2 text-sm text-muted-foreground">
            {lead.whatsapp_number ? (
              <span className="inline-flex items-center gap-1">
                <Phone className="size-3" />+{lead.whatsapp_number}
              </span>
            ) : null}
            {lead.email ? (
              <span className="inline-flex items-center gap-1">
                <Mail className="size-3" />{lead.email}
              </span>
            ) : null}
            <span className="inline-flex items-center gap-1">
              <Calendar className="size-3" />
              {new Date(lead.created_at).toLocaleDateString(locale, {
                timeZone: tenant.timezone,
              })}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <LeadStatusSelect
            tenantId={tenant.id}
            leadId={lead.id}
            currentStatus={lead.status}
          />
          {lead.whatsapp_number && lead.status !== "do_not_contact" ? (
            <CallSandraButton
              tenantId={tenant.id}
              leadId={lead.id}
              phone={`+${lead.whatsapp_number}`}
              leadName={lead.name}
              leadCompany={vertical}
              notes={lead.notes}
              size="default"
              variant="default"
            />
          ) : null}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6">
        {/* Main column — prospect research + notes */}
        <div className="space-y-6">
        <ResearchCard tenantId={tenant.id} kind="lead" subjectId={lead.id} research={research} cost={researchCost} />
        {/* Notes */}
        <Card className="p-5">
          <div className="mb-3">
            <p className="font-semibold">
              {(() => {
                try { return t("notes_title"); } catch { return "Notas internas"; }
              })()}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {(() => {
                try { return t("notes_subtitle"); } catch { return "Solo vos las ves. Útil para recordar contexto en la próxima llamada."; }
              })()}
            </p>
          </div>
          <LeadNotesEditor
            tenantId={tenant.id}
            leadId={lead.id}
            initialNotes={lead.notes}
          />
        </Card>
        </div>

        {/* Sidebar — facts */}
        <Card className="p-5 space-y-3 h-fit">
          <p className="font-semibold mb-1">
            {(() => {
              try { return t("detail_facts_title"); } catch { return "Información"; }
            })()}
          </p>

          {lead.intent ? (
            <Fact icon={Tag} label={(() => { try { return t("filter_intent"); } catch { return "Intent"; } })()}>
              <Badge variant="outline" className={intentBadgeClass(lead.intent)}>
                {intentLabel(lead.intent)}
              </Badge>
            </Fact>
          ) : null}

          {country ? (
            <Fact icon={Globe} label={(() => { try { return t("filter_country"); } catch { return "Country"; } })()}>
              <span>{country.flag} {COUNTRY_BY_CODE[country.code]?.name}</span>
            </Fact>
          ) : null}
          {state ? (
            <Fact label={(() => { try { return t("filter_state"); } catch { return "State"; } })()}>
              {state}
            </Fact>
          ) : null}
          {city ? (
            <Fact label={(() => { try { return t("filter_city"); } catch { return "City"; } })()}>
              {city}
            </Fact>
          ) : null}
          {vertical ? (
            <Fact label={(() => { try { return t("filter_vertical"); } catch { return "Vertical"; } })()}>
              {vertical.replace(/_/g, " ")}
            </Fact>
          ) : null}
          {website ? (
            <Fact label={(() => { try { return t("website"); } catch { return "Website"; } })()}>
              <a href={website} target="_blank" rel="noopener" className="text-primary hover:underline inline-flex items-center gap-1">
                {website.replace(/^https?:\/\//, "").slice(0, 30)}
                <ExternalLink className="size-3" />
              </a>
            </Fact>
          ) : null}
          <Fact label={(() => { try { return t("filter_source"); } catch { return "Source"; } })()}>
            {sourceLabel}
          </Fact>
        </Card>
      </div>

      {/* Activity timeline — creation + BOLIV research + calls */}
      <Card className="mt-6 p-5">
        <p className="font-semibold mb-4">
          {(() => {
            try { return tp("timeline_title"); } catch { return "Actividad"; }
          })()}
        </p>
        <ActivityTimeline items={activity} timezone={tenant.timezone} isStaff={isStaff} />
      </Card>
    </div>
  );
}

function Fact({
  icon: Icon,
  label,
  children,
}: {
  icon?: typeof Phone;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3 text-sm">
      <span className="inline-flex items-center gap-1.5 text-muted-foreground text-xs uppercase tracking-wider">
        {Icon ? <Icon className="size-3" /> : null}
        {label}
      </span>
      <span className="text-right">{children}</span>
    </div>
  );
}
