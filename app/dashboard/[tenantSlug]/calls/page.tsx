import Link from "next/link";
import { PhoneIncoming, PhoneOutgoing, Phone, ExternalLink } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getTenantBySlug } from "@/lib/tenant";
import { requireUser, requireTenantAccess } from "@/lib/auth";
import { listVoiceConversations } from "@/lib/queries/voice-conversations";
import { RecordingPlayer } from "@/components/voice/recording-player";

export const dynamic = "force-dynamic";

const OUTCOME_CLASS: Record<string, string> = {
  success: "bg-emerald-500/10 text-emerald-600 border-emerald-500/30",
  failure: "bg-red-500/10 text-red-600 border-red-500/30",
  unknown: "bg-muted text-muted-foreground border-border",
};

export default async function CallsPage({
  params,
}: {
  params: Promise<{ tenantSlug: string }>;
}) {
  const { tenantSlug } = await params;
  const tenant = await getTenantBySlug(tenantSlug);
  await requireUser();
  await requireTenantAccess(tenant.id);

  const calls = await listVoiceConversations(tenant.id, 100);

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

      {calls.length === 0 ? (
        <Card className="py-16 flex flex-col items-center text-center">
          <Phone className="size-10 text-muted-foreground mb-4" />
          <p className="font-medium">Aún no hay llamadas</p>
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
                      {c.user_id && c.user_name ? (
                        <Link
                          href={`/dashboard/${tenantSlug}/customers/${c.user_id}`}
                          className="hover:text-primary hover:underline font-medium"
                        >
                          {c.user_name}
                        </Link>
                      ) : (
                        <span className="font-medium">{c.user_name ?? "—"}</span>
                      )}
                      <div className="text-xs text-muted-foreground font-mono">
                        {c.caller_phone ?? c.user_whatsapp ? `+${c.caller_phone ?? c.user_whatsapp}` : ""}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {new Date(c.started_at).toLocaleString()}
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
