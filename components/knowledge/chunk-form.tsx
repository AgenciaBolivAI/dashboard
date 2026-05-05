"use client";

import { useActionState, useEffect } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  addManualChunkAction,
  updateChunkAction,
  type IngestState,
  type KnowledgeType,
} from "@/lib/actions/knowledge";
import type { AnyChunk, FaqChunk, PainChunk } from "@/lib/queries/knowledge";

const initial: IngestState = { error: null };

export function ChunkFormDialog({
  open,
  onClose,
  tenantId,
  type,
  chunk,
}: {
  open: boolean;
  onClose: () => void;
  tenantId: string;
  type: KnowledgeType;
  chunk: AnyChunk | null;
}) {
  const isEdit = !!chunk;
  const [state, action, pending] = useActionState(
    isEdit ? updateChunkAction : addManualChunkAction,
    initial,
  );

  useEffect(() => {
    if (state.error) toast.error(state.error);
    if (state.success) {
      toast.success(isEdit ? "Chunk actualizado" : "Chunk añadido");
      onClose();
    }
  }, [state, isEdit, onClose]);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>
            {isEdit ? "Editar chunk" : "Agregar chunk manualmente"}
          </DialogTitle>
          <DialogDescription>
            {type === "documents"
              ? "Información que el agente recupera para responder preguntas (precios, horarios, políticas)."
              : "Conocimiento clínico que el agente usa para sugerir diagnósticos y orientar al paciente."}
          </DialogDescription>
        </DialogHeader>

        <form action={action} className="space-y-4">
          <input type="hidden" name="tenant_id" value={tenantId} />
          <input type="hidden" name="type" value={type} />
          {chunk ? <input type="hidden" name="id" value={chunk.id} /> : null}

          <div className="space-y-2">
            <Label htmlFor="source">Fuente</Label>
            <Input
              id="source"
              name="source"
              defaultValue={chunk?.source ?? "manual"}
              placeholder="manual"
            />
          </div>

          {type === "documents" ? (
            <>
              <Field
                label="Pregunta"
                name="question"
                defaultValue={(chunk as FaqChunk | null)?.question ?? ""}
                placeholder="¿Cuánto cuesta una limpieza dental?"
              />
              <FieldArea
                label="Respuesta"
                name="answer"
                defaultValue={(chunk as FaqChunk | null)?.answer ?? ""}
                placeholder="Bs. 150, incluye revisión"
                rows={2}
              />
              <FieldArea
                label="Plantilla de respuesta del agente"
                name="response_template"
                defaultValue={(chunk as FaqChunk | null)?.response_template ?? ""}
                placeholder="Una limpieza tiene un costo de Bs. 150 e incluye revisión general 😊"
                rows={2}
              />
            </>
          ) : (
            <>
              <Field
                label="Síntoma"
                name="symptom"
                defaultValue={(chunk as PainChunk | null)?.symptom ?? ""}
                placeholder="Dolor lumbar bajo prolongado"
              />
              <FieldArea
                label="Diagnóstico probable"
                name="diagnosis"
                defaultValue={(chunk as PainChunk | null)?.diagnosis ?? ""}
                placeholder="Lumbalgia mecánica"
                rows={2}
              />
              <FieldArea
                label="Recomendación"
                name="recommendation"
                defaultValue={(chunk as PainChunk | null)?.recommendation ?? ""}
                placeholder="Sesión de fisio + corrección postural"
                rows={2}
              />
            </>
          )}

          <FieldArea
            label="Contenido (texto que se va a vectorizar)"
            name="content"
            defaultValue={chunk?.content ?? ""}
            placeholder="El texto completo de este chunk. Esto es lo que se busca por similitud."
            rows={5}
            required
          />

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Guardando…" : isEdit ? "Guardar" : "Crear"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Field({
  label,
  ...rest
}: { label: string } & React.ComponentProps<typeof Input>) {
  return (
    <div className="space-y-2">
      <Label htmlFor={rest.name as string}>{label}</Label>
      <Input id={rest.name as string} {...rest} />
    </div>
  );
}

function FieldArea({
  label,
  rows = 3,
  ...rest
}: {
  label: string;
  rows?: number;
} & React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <div className="space-y-2">
      <Label htmlFor={rest.name as string}>{label}</Label>
      <textarea
        id={rest.name as string}
        rows={rows}
        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        {...rest}
      />
    </div>
  );
}
