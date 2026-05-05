import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Mail, Phone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { ConversationStatusBadge } from "@/components/conversations/status-badge";
import { LiveThread } from "@/components/conversations/live-thread";
import { HitlControls } from "@/components/conversations/hitl-controls";
import { OperatorInput } from "@/components/conversations/operator-input";
import { getTenantBySlug } from "@/lib/tenant";
import { getConversationDetail } from "@/lib/queries/conversations";
import { formatDate, formatRelative } from "@/lib/utils";

export default async function ConversationDetailPage({
  params,
}: {
  params: Promise<{ tenantSlug: string; id: string }>;
}) {
  const { tenantSlug, id } = await params;
  const tenant = await getTenantBySlug(tenantSlug);
  const convo = await getConversationDetail(tenant.id, id);
  if (!convo) notFound();

  return (
    <div className="flex h-[calc(100vh-4rem)]">
      {/* Thread */}
      <div className="flex-1 flex flex-col min-w-0">
        <div className="border-b border-border px-6 py-4 flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <Button asChild variant="ghost" size="icon">
              <Link href={`/dashboard/${tenantSlug}/conversations`}>
                <ArrowLeft />
              </Link>
            </Button>
            <div>
              <p className="font-medium">{convo.user.name ?? "Sin nombre"}</p>
              <p className="text-xs text-muted-foreground">+{convo.user.whatsapp_number}</p>
            </div>
            <ConversationStatusBadge
              status={convo.status}
              hitl={convo.hitl_taken_over}
            />
          </div>
          <HitlControls conversationId={convo.id} isHitl={convo.hitl_taken_over} />
        </div>

        <LiveThread conversationId={convo.id} initialMessages={convo.messages} />

        {convo.hitl_taken_over ? (
          <OperatorInput conversationId={convo.id} />
        ) : null}
      </div>

      {/* Right sidebar */}
      <aside className="hidden lg:block w-80 border-l border-border bg-card p-6 overflow-y-auto">
        <h3 className="font-display font-semibold mb-4">Cliente</h3>
        <div className="space-y-3 text-sm">
          <Field label="Nombre" value={convo.user.name ?? "—"} />
          <Field
            label="WhatsApp"
            value={`+${convo.user.whatsapp_number}`}
            icon={<Phone className="size-3.5" />}
          />
          {convo.user.email ? (
            <Field
              label="Email"
              value={convo.user.email}
              icon={<Mail className="size-3.5" />}
            />
          ) : null}
        </div>

        <Separator className="my-6" />

        <h3 className="font-display font-semibold mb-4">Conversación</h3>
        <div className="space-y-3 text-sm">
          <Field label="Iniciada" value={formatDate(convo.created_at)} />
          <Field
            label="Último mensaje"
            value={formatRelative(convo.last_message_at)}
          />
          <Field label="Mensajes" value={String(convo.messages.length)} />
          {convo.hitl_taken_over ? (
            <div className="rounded-md border border-yellow-500/30 bg-yellow-500/5 p-3 mt-4">
              <p className="text-[10px] uppercase tracking-wider text-yellow-500 font-bold mb-1">
                Modo operador activo
              </p>
              <p className="text-xs text-muted-foreground">
                El bot está pausado. Tus mensajes irán al cliente
                directamente. Devuelve el control cuando termines.
              </p>
            </div>
          ) : null}
        </div>
      </aside>
    </div>
  );
}

function Field({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon?: React.ReactNode;
}) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium mb-0.5">
        {label}
      </p>
      <p className="flex items-center gap-1.5">
        {icon}
        {value}
      </p>
    </div>
  );
}
