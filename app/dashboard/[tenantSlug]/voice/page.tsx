import { Mic } from "lucide-react";
import { getTenantBySlug } from "@/lib/tenant";
import { requireUser, requireTenantAccess } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { VoicePersonaEditor } from "@/components/voice/voice-persona-editor";
import { TwilioSetupWizard } from "@/components/voice/twilio-setup-wizard";
import type { VoicePersona } from "@/lib/voice/persona";

export const dynamic = "force-dynamic";

export default async function VoicePersonaPage({
  params,
}: {
  params: Promise<{ tenantSlug: string }>;
}) {
  const { tenantSlug } = await params;
  const tenant = await getTenantBySlug(tenantSlug);
  await requireUser();
  await requireTenantAccess(tenant.id);

  const supabase = await createClient();
  const { data } = await supabase
    .from("tenants")
    .select("voice_persona, voice_phone_number, voice_phone_provider" as never)
    .eq("id", tenant.id)
    .single();

  const row = data as unknown as {
    voice_persona?: VoicePersona;
    voice_phone_number?: string | null;
    voice_phone_provider?: string | null;
  } | null;
  const persona: VoicePersona = row?.voice_persona ?? {};

  return (
    <div className="p-6 md:p-8 max-w-3xl space-y-8">
      <div>
        <h1 className="text-3xl font-display font-extrabold tracking-tight flex items-center gap-2">
          <Mic className="size-7 text-primary" />
          Agentes de voz
        </h1>
        <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
          Sandra y Rebecca son los agentes de voz que vienen incluidos con BolivAI. Vos
          no tenés que configurar ElevenLabs ni nada técnico — solo conectá tu número de
          Twilio y decinos cómo querés que se presenten.
        </p>
      </div>

      {/* Step 1 — phone number */}
      <section>
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
          Paso 1 · Conectá tu número
        </h2>
        <TwilioSetupWizard
          tenantId={tenant.id}
          current={{
            phone_number: row?.voice_phone_number ?? null,
            provider: row?.voice_phone_provider ?? null,
          }}
        />
      </section>

      {/* Step 2 — persona */}
      <section>
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
          Paso 2 · Personalidad de Sandra y Rebecca
        </h2>
        <VoicePersonaEditor tenantId={tenant.id} initial={persona} />
      </section>
    </div>
  );
}
