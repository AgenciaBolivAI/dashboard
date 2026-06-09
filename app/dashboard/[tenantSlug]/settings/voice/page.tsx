import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Mic, Phone, ExternalLink, AlertTriangle, CheckCircle2 } from "lucide-react";
import { getTenantBySlug } from "@/lib/tenant";
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

  const hasAgent = !!tenant.elevenlabs_agent_id;
  const currentVoiceId = tenant.voice_id ?? DEFAULT_VOICE_ID;
  const currentVoice = getVoiceById(currentVoiceId);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Mic className="size-5" />
            Agente de voz
            {tenant.voice_enabled ? (
              <Badge variant="success">Activo</Badge>
            ) : hasAgent ? (
              <Badge variant="outline">Pausado</Badge>
            ) : (
              <Badge variant="outline">No configurado</Badge>
            )}
          </CardTitle>
          <CardDescription>
            Cuando activas la voz, BolivAI crea un agente conversacional en
            ElevenLabs usando el prompt de tu agente actual. Tus clientes podrán
            llamar y hablar con él para agendar, cancelar o resolver dudas
            como si fuera un asistente humano.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {!hasAgent ? (
            <p className="text-sm text-muted-foreground">
              Al activar, creamos automáticamente tu agente de voz. El prompt
              que ya configuraste en{" "}
              <strong>Ajustes → Agente</strong> se reutiliza tal cual — no
              tienes que volver a escribirlo.
            </p>
          ) : (
            <dl className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
              <DlField
                label="ID del agente"
                value={tenant.elevenlabs_agent_id ?? "—"}
                mono
              />
              <DlField label="Voz" value={currentVoice?.name ?? "—"} />
              <DlField
                label="Idioma del prompt"
                value={(tenant.language || "en").toUpperCase()}
              />
            </dl>
          )}

          <VoiceToggle
            tenantId={tenant.id}
            enabled={tenant.voice_enabled}
            hasAgent={hasAgent}
          />

          {hasAgent ? (
            <a
              href={`https://elevenlabs.io/app/conversational-ai/agents/${tenant.elevenlabs_agent_id}`}
              target="_blank"
              rel="noreferrer"
              className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
            >
              <ExternalLink className="size-3" />
              Abrir el agente en ElevenLabs
            </a>
          ) : null}
        </CardContent>
      </Card>

      {hasAgent ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Phone className="size-5" />
              Número de teléfono
              {tenant.voice_phone_number ? (
                <Badge variant="success">Conectado</Badge>
              ) : (
                <Badge variant="outline">Sin número</Badge>
              )}
            </CardTitle>
            <CardDescription>
              Conecta un número de Twilio que ya tengas, y BolivAI lo conectará
              al agente de voz. Los clientes que llamen a ese número hablarán
              directamente con tu agente.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {tenant.voice_phone_number ? (
              <>
                <div className="rounded-md border border-primary/30 bg-primary/5 p-3 text-sm flex items-start gap-2">
                  <CheckCircle2 className="size-4 text-primary shrink-0 mt-0.5" />
                  <div>
                    <p className="font-medium">
                      Tu agente está conectado a{" "}
                      <span className="font-mono">{tenant.voice_phone_number}</span>
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Pruébalo: llama a ese número desde otro teléfono y
                      pregúntale al agente por tus servicios. Las llamadas se
                      cobran a tu cuenta de Twilio al precio estándar.
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
            <CardTitle>Voz y saludo</CardTitle>
            <CardDescription>
              Cambia la voz del agente o personaliza el saludo inicial. Los
              cambios se aplican en ElevenLabs al instante.
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
          Tu agente puede consultar disponibilidad, reservar, reagendar,
          cancelar y capturar leads usando las mismas herramientas que el
          agente de WhatsApp. La sincronización del conocimiento (servicios +
          FAQs) y la facturación por minuto llegan en las siguientes fases.
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
