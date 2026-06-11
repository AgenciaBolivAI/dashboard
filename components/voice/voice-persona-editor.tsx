"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Save, MessageSquare, Megaphone, Headphones } from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { updateVoicePersonaAction } from "@/lib/actions/voice";
import type { VoicePersona } from "@/lib/voice/persona";
import { cn } from "@/lib/utils";

const LANGUAGES = [
  { code: "es", label: "Español" },
  { code: "en", label: "English" },
  { code: "pt", label: "Português" },
  { code: "fr", label: "Français" },
  { code: "it", label: "Italiano" },
];

export function VoicePersonaEditor({
  tenantId,
  initial,
}: {
  tenantId: string;
  initial: VoicePersona;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [p, setP] = useState<VoicePersona>(initial);

  function patch(updater: (prev: VoicePersona) => VoicePersona) {
    setP(updater);
  }

  function save() {
    startTransition(async () => {
      const res = await updateVoicePersonaAction({
        tenant_id: tenantId,
        persona: p,
      });
      if (res.error) {
        toast.error(res.error);
        return;
      }
      toast.success("Persona guardada — Sandra y Rebecca ya usan los cambios en su próxima llamada");
      router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      {/* Shared identity */}
      <Card className="p-6 space-y-4">
        <div>
          <p className="font-semibold flex items-center gap-2">
            <MessageSquare className="size-4 text-primary" />
            Identidad
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Cómo se presentan tus agentes y qué saben de tu negocio.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label className="text-xs">Nombre del negocio</Label>
            <Input
              value={p.business_name ?? ""}
              onChange={(e) => patch((x) => ({ ...x, business_name: e.target.value }))}
              placeholder="Ej: Hostal Andino"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Idioma principal</Label>
            <select
              value={p.language ?? "es"}
              onChange={(e) => patch((x) => ({ ...x, language: e.target.value }))}
              className={cn(
                "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm",
                "ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              )}
            >
              {LANGUAGES.map((l) => (
                <option key={l.code} value={l.code}>{l.label}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs">Descripción del negocio</Label>
          <textarea
            value={p.business_description ?? ""}
            onChange={(e) => patch((x) => ({ ...x, business_description: e.target.value }))}
            rows={3}
            placeholder="Una o dos oraciones que tus agentes pueden usar cuando alguien pregunte qué hacés."
            className={cn(
              "flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm",
              "ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-y",
            )}
          />
        </div>
      </Card>

      {/* Sandra */}
      <Card className="p-6 space-y-4">
        <div>
          <p className="font-semibold flex items-center gap-2">
            <Megaphone className="size-4 text-orange-500" />
            Sandra · ventas / outbound
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Llama a tus leads. Lo que escriban acá Sandra lo aplica en cada llamada de inmediato.
          </p>
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs">Primera frase</Label>
          <Input
            value={p.sandra?.first_message ?? ""}
            onChange={(e) =>
              patch((x) => ({ ...x, sandra: { ...x.sandra, first_message: e.target.value } }))
            }
            placeholder={`Ej: Hola, te habla Sandra de ${p.business_name ?? "[tu negocio]"}.`}
          />
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs">Propuesta de valor</Label>
          <textarea
            value={p.sandra?.value_prop ?? ""}
            onChange={(e) =>
              patch((x) => ({ ...x, sandra: { ...x.sandra, value_prop: e.target.value } }))
            }
            rows={3}
            placeholder="Una o dos oraciones que Sandra puede usar como pitch sin recitarlas textualmente. Ej: Ayudamos a hoteles boutique a llenar habitaciones por WhatsApp sin contratar más recepcionistas."
            className={cn(
              "flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm",
              "ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-y",
            )}
          />
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs">Cosas que Sandra NO debe decir</Label>
          <textarea
            value={p.sandra?.forbidden_topics ?? ""}
            onChange={(e) =>
              patch((x) => ({ ...x, sandra: { ...x.sandra, forbidden_topics: e.target.value } }))
            }
            rows={2}
            placeholder="Ej: No prometer fechas de entrega; no compartir precios sin antes calificar el caso."
            className={cn(
              "flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm",
              "ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-y",
            )}
          />
        </div>
      </Card>

      {/* Rebecca */}
      <Card className="p-6 space-y-4">
        <div>
          <p className="font-semibold flex items-center gap-2">
            <Headphones className="size-4 text-cyan-500" />
            Rebecca · atención al cliente / inbound
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Atiende a tus clientes cuando ellos llaman. Lo que pegues acá es su contexto.
          </p>
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs">Primera frase</Label>
          <Input
            value={p.rebecca?.first_message ?? ""}
            onChange={(e) =>
              patch((x) => ({ ...x, rebecca: { ...x.rebecca, first_message: e.target.value } }))
            }
            placeholder={`Ej: Hola, gracias por llamar a ${p.business_name ?? "[tu negocio]"}. ¿En qué puedo ayudarte?`}
          />
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs">FAQs / información que Rebecca debe saber</Label>
          <textarea
            value={p.rebecca?.faq ?? ""}
            onChange={(e) =>
              patch((x) => ({ ...x, rebecca: { ...x.rebecca, faq: e.target.value } }))
            }
            rows={6}
            placeholder="Horarios, política de cancelación, formas de pago, cómo agendar, dirección, lo que tus clientes preguntan seguido. Rebecca lo lee en cada llamada."
            className={cn(
              "flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm",
              "ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-y",
            )}
          />
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs">Cosas que Rebecca NO debe decir</Label>
          <textarea
            value={p.rebecca?.forbidden_topics ?? ""}
            onChange={(e) =>
              patch((x) => ({ ...x, rebecca: { ...x.rebecca, forbidden_topics: e.target.value } }))
            }
            rows={2}
            placeholder="Ej: No agendar más de 4 personas por reserva. No prometer descuentos sin confirmar con un humano."
            className={cn(
              "flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm",
              "ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-y",
            )}
          />
        </div>
      </Card>

      <div className="flex justify-end">
        <Button onClick={save} disabled={pending} size="lg" className="gap-2">
          {pending ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
          Guardar persona
        </Button>
      </div>
    </div>
  );
}
