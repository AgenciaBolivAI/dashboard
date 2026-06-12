import Link from "next/link";
import { PhoneIncoming, PhoneOutgoing, Phone, ExternalLink } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getTenantBySlug } from "@/lib/tenant";
import { requireUser, requireTenantAccess } from "@/lib/auth";
import { listVoiceConversations } from "@/lib/queries/voice-conversations";
import { RecordingPlayer } from "@/components/voice/recording-player";
import { RealtimeSearch } from "@/components/ui/realtime-search";

export const dynamic = "force-dynamic";

const OUTCOME_CLASS: Record<string, string> = {
  success: "bg-emerald-500/10 text-emerald-600 border-emerald-500/30",
  failure: "bg-red-500/10 text-red-600 border-red-500/30",
  unknown: "bg-muted text-muted-foreground border-border",
};

export default async function CallsPage({
  params,
  searchParams,
}: {
  params: Promise<{ tenantSlug: string }>;
  searchParams: Promise<{ q?: string }>;
}) {
  const { tenantSlug } = await params;
  const { q } = await searchParams;
  const tenant = await getTenantBySlug(tenantSlug);
  await requireUser();
  await requireTenantAccess(tenant.id);

  // Fetch a wider window when searching so matches beyond the first page
  // surface; filter server-side in JS (name + phone), cheap at this scale.
  const all = await listVoiceConversations(tenant.id, q ? 500 : 100);
  const needle = q?.trim().toLowerCase() ?? "";
  const digits = needle.replace(/\D/g, "");
  const calls = needle
    ? all.filter((c) => {
        const name = (c.lead_name ?? "").toLowerCase();
        const phone = `${c.caller_phone ?? ""}${c.lead_phone ?? ""}`;
        return (
          name.includes(needle) ||
          (digits.length >= 3 && phone.replace(/\D/g, "").includes(digits))
        );
      })
    : all;

  return (
    <div className="p-6 md:p-8 max-w-6xl">
      <div className="mb-6">
        <h1 className="text-3xl font-display font-extrabold tracking-tight flex items-center gap-2">
          <Phone className="size-7 text-primary" />
          Llamadas
        </h1>
        <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
          Todas las llamadas de Sandra (outbound) y Rebecca (inbound). Apretá ▶ en
          cualquier fila para escuchar la grabación dentro del dashboard — no necesitás
          una cuenta de ElevenLabs.
        </p>
      </div>

      <div className="mb-4">
        <RealtimeSearch placeholder="Buscar por nombre o teléfono…" />
      </div>

      {calls.length === 0 ? (
        <Card className="py-16 flex flex-col items-center text-center">
          <Phone className="size-10 text-muted-foreground mb-4" />
          <p className="font-medium">{q ? "Sin resultados para esa búsqueda" : "Aún no hay llamadas"}</p>
          <p className="text-sm text-muted-foreground mt-1 max-w-md">
            Cuando Sandra empiece a llamar a tus leads o un cliente llame a tu número,
            las llamadas aparecen acá con su grabación.
          </p>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs text-muted-foreground border-b border-border">
                <tr>
                  <th className="text-left px-4 py-3 w-28">Dirección</th>
                  <th className="text-left px-4 py-3">Cliente / Lead</th>
                  <th className="text-left px-4 py-3">Cuándo</th>
                  <th className="text-left px-4 py-3 w-32">Resultado</th>
                  <th className="text-left px-4 py-3 w-44">Grabación</th>
                </tr>
              </thead>
              <tbody>
                {calls.map((c) => (
                  <tr key={c.id} className="border-t border-border hover:bg-secondary/30">
                    <td className="px-4 py-3">
                      {c.direction === "inbound" ? (
                        <span className="inline-flex items-center gap-1 text-cyan-600">
                          <PhoneIncoming className="size-3.5" />
                          Inbound
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-orange-600">
                          <PhoneOutgoing className="size-3.5" />
                          Outbound
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {c.lead_id && c.lead_name ? (
                        <Link
                          href={`/dashboard/${tenantSlug}/leads/${c.lead_id}`}
                          className="hover:text-primary hover:underline font-medium"
                        >
                          {c.lead_name}
                        </Link>
                      ) : (
                        <span className="font-medium">{c.lead_name ?? "—"}</span>
                      )}
                      <div className="text-xs text-muted-foreground font-mono">
                        {c.lead_phone ? `+${c.lead_phone}` : ""}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {new Date(c.started_at).toLocaleString("es-BO", {
                        dateStyle: "medium",
                        timeStyle: "short",
                        timeZone: tenant.timezone,
                      })}
                    </td>
                    <td className="px-4 py-3">
                      {c.call_outcome ? (
                        <Badge
                          variant="outline"
                          className={OUTCOME_CLASS[c.call_outcome] ?? OUTCOME_CLASS.unknown}
                        >
                          {c.call_outcome}
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground text-xs">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <RecordingPlayer
                          conversationId={c.conversation_id}
                          durationSeconds={c.duration_seconds}
                        />
                        <a
                          href={`https://elevenlabs.io/app/conversational-ai/history/${c.conversation_id}`}
                          target="_blank"
                          rel="noopener"
                          title="Open in ElevenLabs (admin)"
                          className="text-muted-foreground hover:text-foreground"
                        >
                          <ExternalLink className="size-3.5" />
                        </a>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
