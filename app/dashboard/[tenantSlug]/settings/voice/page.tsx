import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Mic, Phone, ExternalLink, AlertTriangle, CheckCircle2 } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { getTenantBySlug } from "@/lib/tenant";
import { isBolivAIAdmin } from "@/lib/auth";
import { CURATED_VOICES, DEFAULT_VOICE_ID, getVoiceById } from "@/lib/voices";
import { VoiceToggle } from "./voice-toggle";
import { VoiceSettingsForm } from "./voice-settings-form";
import { PhoneAttachForm, PhoneDetachedView } from "./phone-form";

export default async function VoiceSettingsPage({
  params,
}: {
  params: Promise<{ tenantSlug: string }>;
}) {
  const { tenantSlug } = await params;
  const tenant = await getTenantBySlug(tenantSlug);
  const t = await getTranslations("settings_voice");

  const hasAgent = !!tenant.elevenlabs_agent_id;
  const currentVoiceId = tenant.voice_id ?? DEFAULT_VOICE_ID;
  const currentVoice = getVoiceById(currentVoiceId);
  // The provider-specific agent id + the provider dashboard link are internal —
  // only BolivAI staff see them; tenants never need to know the voice vendor.
  const isStaff = await isBolivAIAdmin();

  return (
    <div className="space-y-6">
      {/* Call-recording disclosure — voice calls are recorded + transcribed.
          Many jurisdictions require all-party consent, so remind the tenant. */}
      <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-4 text-sm flex items-start gap-3">
        <AlertTriangle className="size-4 text-amber-500 shrink-0 mt-0.5" />
        <div>
          <p className="font-medium">{t("recording_notice_title")}</p>
          <p className="text-xs text-muted-foreground mt-1">{t("recording_notice_body")}</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Mic className="size-5" />
            {t("voice_agent_title")}
            {tenant.voice_enabled ? (
              <Badge variant="success">{t("badge_active")}</Badge>
            ) : hasAgent ? (
              <Badge variant="outline">{t("badge_paused")}</Badge>
            ) : (
              <Badge variant="outline">{t("badge_not_configured")}</Badge>
            )}
          </CardTitle>
          <CardDescription>
            {t("voice_agent_description")}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {!hasAgent ? (
            <p className="text-sm text-muted-foreground">
              {t.rich("activate_prompt_hint", {
                strong: (chunks) => <strong>{chunks}</strong>,
              })}
            </p>
          ) : (
            <dl className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
              {isStaff ? (
                <DlField
                  label={t("field_agent_id")}
                  value={tenant.elevenlabs_agent_id ?? "—"}
                  mono
                />
              ) : null}
              <DlField label={t("field_voice")} value={currentVoice?.name ?? "—"} />
              <DlField
                label={t("field_prompt_language")}
                value={(tenant.language || "en").toUpperCase()}
              />
            </dl>
          )}

          <VoiceToggle
            tenantId={tenant.id}
            enabled={tenant.voice_enabled}
            hasAgent={hasAgent}
          />

          {hasAgent && isStaff ? (
            <a
              href={`https://elevenlabs.io/app/conversational-ai/agents/${tenant.elevenlabs_agent_id}`}
              target="_blank"
              rel="noreferrer"
              className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
            >
              <ExternalLink className="size-3" />
              {t("open_in_elevenlabs")}
            </a>
          ) : null}
        </CardContent>
      </Card>

      {hasAgent ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Phone className="size-5" />
              {t("phone_title")}
              {tenant.voice_phone_number ? (
                <Badge variant="success">{t("badge_connected")}</Badge>
              ) : (
                <Badge variant="outline">{t("badge_no_number")}</Badge>
              )}
            </CardTitle>
            <CardDescription>
              {t("phone_description")}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {tenant.voice_phone_number ? (
              <>
                <div className="rounded-md border border-primary/30 bg-primary/5 p-3 text-sm flex items-start gap-2">
                  <CheckCircle2 className="size-4 text-primary shrink-0 mt-0.5" />
                  <div>
                    <p className="font-medium">
                      {t.rich("agent_connected_to", {
                        number: tenant.voice_phone_number,
                        mono: (chunks) => <span className="font-mono">{chunks}</span>,
                      })}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {t("call_test_hint")}
                    </p>
                  </div>
                </div>
                <PhoneDetachedView
                  tenantId={tenant.id}
                  phoneNumber={tenant.voice_phone_number}
                />
              </>
            ) : (
              <PhoneAttachForm tenantId={tenant.id} />
            )}
          </CardContent>
        </Card>
      ) : null}

      {hasAgent ? (
        <Card>
          <CardHeader>
            <CardTitle>{t("voice_and_greeting_title")}</CardTitle>
            <CardDescription>
              {t("voice_and_greeting_description")}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <VoiceSettingsForm
              tenantId={tenant.id}
              currentVoiceId={currentVoiceId}
              currentGreeting={tenant.voice_greeting ?? ""}
              voices={CURATED_VOICES}
            />
          </CardContent>
        </Card>
      ) : null}

      <div className="flex items-start gap-2 text-xs text-muted-foreground">
        <AlertTriangle className="size-4 shrink-0 mt-0.5" />
        <p>
          {t("footer_capabilities_note")}
        </p>
      </div>
    </div>
  );
}

function DlField({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className={mono ? "font-mono text-xs break-all" : ""}>{value}</dd>
    </div>
  );
}
