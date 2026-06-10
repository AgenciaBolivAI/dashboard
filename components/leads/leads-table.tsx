"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { PhoneCall, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { addLeadsToSandraQueueAction } from "@/lib/actions/sandra-queue";
import { updateLeadStatusAction, deleteLeadAction } from "@/lib/actions/leads";
import { LEAD_STATUSES, type LeadStatus } from "@/lib/leads-types";
import { intentLabel, intentBadgeClass } from "@/lib/leads-intents";
import { formatDate, cn } from "@/lib/utils";

export type LeadFromQuery = {
  id: string;
  name: string | null;
  whatsapp_number: string | null;
  email: string | null;
  intent: string | null;
  status: string;
  created_at: string;
  conversation_id?: string | null;
  notes?: string | null;
};

const STATUS_LABEL: Record<LeadStatus, string> = {
  new: "Nuevo",
  contacted: "Contactado",
  converted: "Convertido",
  lost: "Perdido",
};

const STATUS_CLASS: Record<LeadStatus, string> = {
  new: "bg-primary/10 text-primary border-primary/30 hover:bg-primary/15",
  contacted: "bg-yellow-500/10 text-yellow-600 border-yellow-500/30 hover:bg-yellow-500/15",
  converted: "bg-green-500/10 text-green-600 border-green-500/30 hover:bg-green-500/15",
  lost: "bg-muted text-muted-foreground border-border hover:bg-muted/80",
};

export function LeadsTable({
  tenantId,
  leads,
}: {
  tenantId: string;
  leads: LeadFromQuery[];
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [adding, startAdd] = useTransition();
  const [rowPending, startRowPending] = useTransition();

  const callableIds = useMemo(
    () => leads.filter((l) => !!l.whatsapp_number).map((l) => l.id),
    [leads],
  );

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAllCallable() {
    setSelected((prev) => (prev.size > 0 ? new Set() : new Set(callableIds)));
  }

  function addToSandra() {
    if (selected.size === 0) {
      toast.error("Selecciona al menos un lead con teléfono");
      return;
    }
    startAdd(async () => {
      const res = await addLeadsToSandraQueueAction(tenantId, [...selected]);
      if (res.error) {
        toast.error(res.error);
        return;
      }
      const added = res.count ?? 0;
      const skipped = selected.size - added;
      toast.success(
        added === 0
          ? "Todos ya estaban en la cola"
          : skipped > 0
            ? `${added} agregados, ${skipped} ya estaban en cola`
            : `${added} agregados a la cola de Sandra`,
      );
      setSelected(new Set());
      router.refresh();
    });
  }

  function handleStatusChange(leadId: string, next: string) {
    startRowPending(async () => {
      const res = await updateLeadStatusAction(tenantId, leadId, next);
      if (res.error) toast.error(res.error);
      else {
        toast.success(`Marcado como ${STATUS_LABEL[next as LeadStatus] ?? next}`);
        router.refresh();
      }
    });
  }

  function handleDelete(leadId: string) {
    if (!confirm("¿Eliminar este lead?")) return;
    startRowPending(async () => {
      const res = await deleteLeadAction(tenantId, leadId);
      if (res.error) toast.error(res.error);
      else {
        toast.success("Lead eliminado");
        router.refresh();
      }
    });
  }

  if (leads.length === 0) return null;

  return (
    <>
      <div className="mb-3 flex items-center justify-between flex-wrap gap-3">
        <p className="text-sm text-muted-foreground">
          {selected.size > 0
            ? `${selected.size} seleccionado${selected.size === 1 ? "" : "s"}`
            : `${leads.length} lead${leads.length === 1 ? "" : "s"}`}
        </p>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={toggleAllCallable}
            disabled={callableIds.length === 0}
          >
            {selected.size > 0
              ? "Limpiar selección"
              : `Con teléfono (${callableIds.length})`}
          </Button>
          <Button
            size="sm"
            onClick={addToSandra}
            disabled={adding || selected.size === 0}
            className="gap-1.5"
          >
            {adding ? <Loader2 className="size-4 animate-spin" /> : <PhoneCall className="size-4" />}
            Agregar a la cola de Sandra
          </Button>
        </div>
      </div>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-8" />
              <TableHead>Nombre</TableHead>
              <TableHead>Contacto</TableHead>
              <TableHead>Intención</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead className="w-32">Capturado</TableHead>
              <TableHead className="w-12" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {leads.map((l) => {
              const canSelect = !!l.whatsapp_number;
              const statusKey = (LEAD_STATUSES as readonly string[]).includes(l.status)
                ? (l.status as LeadStatus)
                : "new";
              return (
                <TableRow key={l.id} className={cn(!canSelect && "opacity-70", rowPending && "transition-opacity")}>
                  <TableCell className="w-8">
                    <input
                      type="checkbox"
                      checked={selected.has(l.id)}
                      disabled={!canSelect}
                      onChange={() => toggle(l.id)}
                      className="size-4 rounded border cursor-pointer disabled:opacity-30"
                      title={canSelect ? "Seleccionar" : "Sin teléfono"}
                    />
                  </TableCell>
                  <TableCell className="font-medium">{l.name ?? "—"}</TableCell>
                  <TableCell className="text-sm">
                    {l.whatsapp_number ? <div>+{l.whatsapp_number}</div> : null}
                    {l.email ? <div className="text-muted-foreground text-xs">{l.email}</div> : null}
                  </TableCell>
                  <TableCell>
                    {l.intent ? (
                      <Badge variant="outline" className={intentBadgeClass(l.intent)}>
                        {intentLabel(l.intent)}
                      </Badge>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <select
                      value={l.status}
                      onChange={(e) => handleStatusChange(l.id, e.target.value)}
                      disabled={rowPending}
                      className={cn(
                        "rounded-md border px-2 py-1 text-xs font-medium cursor-pointer transition focus:outline-none focus:ring-2 focus:ring-ring",
                        STATUS_CLASS[statusKey],
                        rowPending && "opacity-50",
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
                    {formatDate(l.created_at)}
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleDelete(l.id)}
                      disabled={rowPending}
                      className="text-muted-foreground hover:text-destructive"
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Card>
    </>
  );
}
