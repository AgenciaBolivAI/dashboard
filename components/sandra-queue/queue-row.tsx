"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2, PhoneCall, Check, X, AlertCircle, Voicemail } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TableCell, TableRow } from "@/components/ui/table";
import {
  updateSandraQueueItemAction,
  removeFromSandraQueueAction,
} from "@/lib/actions/sandra-queue";
import type { SandraQueueItem } from "@/lib/queries/sandra-queue";
import { intentLabel } from "@/lib/leads-intents";
import { cn } from "@/lib/utils";

const STATUS_LABEL: Record<SandraQueueItem["status"], string> = {
  pending: "Pendiente",
  calling: "Llamando",
  completed: "Completada",
  skipped: "Saltada",
  no_answer: "Sin respuesta",
  failed: "Fallida",
};

const STATUS_STYLE: Record<SandraQueueItem["status"], string> = {
  pending: "bg-primary/10 text-primary border-primary/30",
  calling: "bg-amber-500/10 text-amber-600 border-amber-500/30",
  completed: "bg-green-500/10 text-green-600 border-green-500/30",
  skipped: "bg-muted text-muted-foreground border-border",
  no_answer: "bg-blue-500/10 text-blue-600 border-blue-500/30",
  failed: "bg-destructive/10 text-destructive border-destructive/30",
};

export function QueueRow({
  tenantId,
  item,
  selected,
  onToggle,
}: {
  tenantId: string;
  item: SandraQueueItem;
  selected: boolean;
  onToggle: (id: string) => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [optimisticStatus, setOptimisticStatus] = useState(item.status);

  function setStatus(next: SandraQueueItem["status"]) {
    const previous = optimisticStatus;
    setOptimisticStatus(next);
    startTransition(async () => {
      const res = await updateSandraQueueItemAction(tenantId, item.id, {
        status: next,
      });
      if (res.error) {
        toast.error(res.error);
        setOptimisticStatus(previous);
      } else {
        toast.success(`Marcado como ${STATUS_LABEL[next]}`);
        router.refresh();
      }
    });
  }

  function remove() {
    if (!confirm("¿Quitar de la cola?")) return;
    startTransition(async () => {
      const res = await removeFromSandraQueueAction(tenantId, item.id);
      if (res.error) toast.error(res.error);
      else {
        toast.success("Quitado de la cola");
        router.refresh();
      }
    });
  }

  const canSelect = optimisticStatus === "pending";

  return (
    <TableRow className={cn(pending && "opacity-60")}>
      <TableCell className="w-8">
        <input
          type="checkbox"
          checked={selected}
          disabled={!canSelect}
          onChange={() => onToggle(item.id)}
          className="size-4 rounded border cursor-pointer disabled:opacity-30"
        />
      </TableCell>
      <TableCell className="font-medium">{item.lead_name ?? "—"}</TableCell>
      <TableCell className="text-sm">
        {item.lead_phone ? <div>+{item.lead_phone}</div> : null}
        {item.lead_email ? (
          <div className="text-muted-foreground text-xs">{item.lead_email}</div>
        ) : null}
      </TableCell>
      <TableCell>
        {item.lead_intent ? (
          <Badge variant="outline" className="text-xs">
            {intentLabel(item.lead_intent)}
          </Badge>
        ) : (
          <span className="text-muted-foreground text-xs">—</span>
        )}
      </TableCell>
      <TableCell>
        {item.lead_source ? (
          <Badge variant="outline" className="text-xs">
            {item.lead_source}
          </Badge>
        ) : (
          <span className="text-muted-foreground text-xs">—</span>
        )}
      </TableCell>
      <TableCell>
        <Badge
          variant="outline"
          className={cn("text-xs", STATUS_STYLE[optimisticStatus])}
        >
          {STATUS_LABEL[optimisticStatus]}
        </Badge>
      </TableCell>
      <TableCell className="text-xs text-muted-foreground">
        {item.attempts > 0 ? `${item.attempts}x` : "—"}
      </TableCell>
      <TableCell>
        <div className="flex items-center gap-1">
          {optimisticStatus !== "completed" && (
            <Button
              size="icon"
              variant="ghost"
              disabled={pending}
              onClick={() => setStatus("completed")}
              title="Marcar completada"
              className="text-green-600 hover:bg-green-500/10"
            >
              <Check className="size-4" />
            </Button>
          )}
          {optimisticStatus !== "no_answer" && (
            <Button
              size="icon"
              variant="ghost"
              disabled={pending}
              onClick={() => setStatus("no_answer")}
              title="Sin respuesta"
              className="text-blue-600 hover:bg-blue-500/10"
            >
              <Voicemail className="size-4" />
            </Button>
          )}
          {optimisticStatus !== "failed" && (
            <Button
              size="icon"
              variant="ghost"
              disabled={pending}
              onClick={() => setStatus("failed")}
              title="Marcar fallida"
              className="text-destructive hover:bg-destructive/10"
            >
              <AlertCircle className="size-4" />
            </Button>
          )}
          {optimisticStatus !== "skipped" && (
            <Button
              size="icon"
              variant="ghost"
              disabled={pending}
              onClick={() => setStatus("skipped")}
              title="Saltar"
              className="text-muted-foreground"
            >
              <X className="size-4" />
            </Button>
          )}
          <Button
            size="icon"
            variant="ghost"
            disabled={pending}
            onClick={remove}
            title="Quitar de la cola"
            className="text-muted-foreground hover:text-destructive"
          >
            <Trash2 className="size-4" />
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
}

export const SANDRA_QUEUE_STATUS_META = { STATUS_LABEL, STATUS_STYLE };
