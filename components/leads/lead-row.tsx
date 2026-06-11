"use client";

import { useState, useTransition } from "react";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TableCell, TableRow } from "@/components/ui/table";
import {
  updateLeadStatusAction,
  deleteLeadAction,
} from "@/lib/actions/leads";
import { LEAD_STATUSES, type LeadStatus } from "@/lib/leads-types";
import { intentLabel, intentBadgeClass } from "@/lib/leads-intents";
import { cn } from "@/lib/utils";

const STATUS_LABEL: Record<LeadStatus, string> = {
  new: "Nuevo",
  contacted: "Contactado",
  warm: "Caliente",
  converted: "Convertido",
  not_interested: "No interesado",
  do_not_contact: "No contactar",
  lost: "Perdido",
};

const STATUS_CLASS: Record<LeadStatus, string> = {
  new: "bg-primary/10 text-primary border-primary/30 hover:bg-primary/15",
  contacted: "bg-yellow-500/10 text-yellow-600 border-yellow-500/30 hover:bg-yellow-500/15",
  warm: "bg-orange-500/10 text-orange-600 border-orange-500/30 hover:bg-orange-500/15",
  converted: "bg-green-500/10 text-green-600 border-green-500/30 hover:bg-green-500/15",
  not_interested: "bg-slate-500/10 text-slate-600 border-slate-500/30 hover:bg-slate-500/15",
  do_not_contact: "bg-red-500/10 text-red-600 border-red-500/30 hover:bg-red-500/15",
  lost: "bg-muted text-muted-foreground border-border hover:bg-muted/80",
};

export type LeadRowData = {
  id: string;
  name: string | null;
  whatsapp_number: string | null;
  email: string | null;
  intent: string | null;
  status: string;
  created_at: string;
};

export function LeadRow({
  tenantId,
  lead,
  capturedLabel,
}: {
  tenantId: string;
  lead: LeadRowData;
  capturedLabel: string;
}) {
  const [pending, startTransition] = useTransition();
  const [optimisticStatus, setOptimisticStatus] = useState(lead.status);

  function handleStatusChange(newStatus: string) {
    if (newStatus === optimisticStatus) return;
    const previous = optimisticStatus;
    setOptimisticStatus(newStatus);
    startTransition(async () => {
      const res = await updateLeadStatusAction(tenantId, lead.id, newStatus);
      if (res.error) {
        toast.error(res.error);
        setOptimisticStatus(previous);
      } else {
        toast.success(`Marcado como ${STATUS_LABEL[newStatus as LeadStatus] ?? newStatus}`);
      }
    });
  }

  function handleDelete() {
    if (!confirm("¿Eliminar este lead?")) return;
    startTransition(async () => {
      const res = await deleteLeadAction(tenantId, lead.id);
      if (res.error) toast.error(res.error);
      else toast.success("Lead eliminado");
    });
  }

  const statusKey = (LEAD_STATUSES as readonly string[]).includes(optimisticStatus)
    ? (optimisticStatus as LeadStatus)
    : "new";

  return (
    <TableRow>
      <TableCell className="font-medium">{lead.name ?? "—"}</TableCell>
      <TableCell className="text-sm">
        {lead.whatsapp_number ? <div>+{lead.whatsapp_number}</div> : null}
        {lead.email ? (
          <div className="text-muted-foreground">{lead.email}</div>
        ) : null}
      </TableCell>
      <TableCell>
        {lead.intent ? (
          <Badge variant="outline" className={intentBadgeClass(lead.intent)}>
            {intentLabel(lead.intent)}
          </Badge>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </TableCell>
      <TableCell>
        <select
          value={optimisticStatus}
          onChange={(e) => handleStatusChange(e.target.value)}
          disabled={pending}
          className={cn(
            "rounded-md border px-2 py-1 text-xs font-medium cursor-pointer transition focus:outline-none focus:ring-2 focus:ring-ring",
            STATUS_CLASS[statusKey],
            pending && "opacity-50",
          )}
        >
          {LEAD_STATUSES.map((s) => (
            <option key={s} value={s}>
              {STATUS_LABEL[s]}
            </option>
          ))}
        </select>
      </TableCell>
      <TableCell className="text-xs text-muted-foreground">
        {capturedLabel}
      </TableCell>
      <TableCell>
        <Button
          variant="ghost"
          size="icon"
          onClick={handleDelete}
          disabled={pending}
          className="text-muted-foreground hover:text-destructive"
        >
          <Trash2 className="size-4" />
        </Button>
      </TableCell>
    </TableRow>
  );
}
