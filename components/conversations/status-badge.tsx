import { Badge } from "@/components/ui/badge";

export function ConversationStatusBadge({
  status,
  hitl,
}: {
  status: string;
  hitl: boolean;
}) {
  if (hitl) return <Badge variant="warning">Operador</Badge>;
  if (status === "active") return <Badge variant="success">Activa</Badge>;
  if (status === "paused") return <Badge variant="muted">Pausada</Badge>;
  if (status === "closed") return <Badge variant="muted">Cerrada</Badge>;
  return <Badge variant="muted">{status}</Badge>;
}
