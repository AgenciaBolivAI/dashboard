"use client";

import { useMemo, useState } from "react";
import { Download, PhoneCall } from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { QueueRow } from "./queue-row";
import type { SandraQueueItem } from "@/lib/queries/sandra-queue";

export function QueueTable({
  tenantId,
  items,
}: {
  tenantId: string;
  items: SandraQueueItem[];
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const pendingIds = useMemo(
    () => items.filter((i) => i.status === "pending").map((i) => i.id),
    [items],
  );

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAllPending() {
    setSelected((prev) => {
      if (prev.size > 0) return new Set();
      return new Set(pendingIds);
    });
  }

  function exportSelectedCsv() {
    const list = items.filter((i) => selected.has(i.id) && i.lead_phone);
    if (list.length === 0) {
      toast.error("No hay seleccionados con teléfono");
      return;
    }
    // Format expected by ElevenLabs batch calling: one row per number plus
    // optional metadata columns the agent receives as call context.
    const rows = list.map((i) => ({
      phone_number: `+${i.lead_phone}`,
      name: i.lead_name ?? "",
      email: i.lead_email ?? "",
      intent: i.lead_intent ?? "",
      source: i.lead_source ?? "",
      queue_id: i.id,
    }));
    const headers = Object.keys(rows[0]) as (keyof typeof rows[number])[];
    const escape = (v: string) =>
      /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
    const csv = [
      headers.join(","),
      ...rows.map((r) =>
        headers.map((h) => escape(String(r[h] ?? ""))).join(","),
      ),
    ].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const stamp = new Date().toISOString().slice(0, 10);
    a.href = url;
    a.download = `sandra-batch-${stamp}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success(`${list.length} contactos exportados`);
  }

  if (items.length === 0) {
    return (
      <Card className="py-16 flex flex-col items-center text-center">
        <PhoneCall className="size-10 text-muted-foreground mb-4" />
        <p className="font-medium">La cola está vacía</p>
        <p className="text-sm text-muted-foreground mt-1 max-w-md">
          Selecciona leads desde la página de Leads y usa &ldquo;Agregar a la cola
          de Sandra&rdquo; para que aparezcan aquí.
        </p>
      </Card>
    );
  }

  return (
    <>
      <div className="mb-3 flex items-center justify-between flex-wrap gap-3">
        <p className="text-sm text-muted-foreground">
          {selected.size > 0
            ? `${selected.size} seleccionado${selected.size === 1 ? "" : "s"}`
            : `${items.length} contacto${items.length === 1 ? "" : "s"} en la cola`}
        </p>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={toggleAllPending}
            disabled={pendingIds.length === 0}
          >
            {selected.size > 0
              ? "Limpiar selección"
              : `Seleccionar pendientes (${pendingIds.length})`}
          </Button>
          <Button
            size="sm"
            onClick={exportSelectedCsv}
            disabled={selected.size === 0}
            className="gap-1.5"
          >
            <Download className="size-4" />
            Exportar CSV para ElevenLabs
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
              <TableHead>Fuente</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead>Intentos</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((it) => (
              <QueueRow
                key={it.id}
                tenantId={tenantId}
                item={it}
                selected={selected.has(it.id)}
                onToggle={toggle}
              />
            ))}
          </TableBody>
        </Table>
      </Card>
    </>
  );
}
