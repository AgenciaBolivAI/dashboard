"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { HelpCircle, Loader2, Plus, X, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  recordUnknownAction,
  resolveUnknownAction,
  type UnknownRow,
} from "@/lib/actions/company-brain";

export function UnknownsList({ unknowns }: { unknowns: UnknownRow[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startSave] = useTransition();
  const [resolving, startResolve] = useTransition();

  const [question, setQuestion] = useState("");
  const [context, setContext] = useState("");

  function handleAdd() {
    if (question.trim().length < 5) {
      toast.error("La pregunta es muy corta");
      return;
    }
    startSave(async () => {
      const res = await recordUnknownAction({
        question: question.trim(),
        context: context.trim() || undefined,
      });
      if (res.error) {
        toast.error(res.error);
        return;
      }
      toast.success("Pregunta registrada");
      setQuestion("");
      setContext("");
      setOpen(false);
      router.refresh();
    });
  }

  function handleResolve(id: string) {
    const answer = window.prompt("Resumen de la respuesta:");
    if (!answer || answer.trim().length < 5) return;
    startResolve(async () => {
      const res = await resolveUnknownAction({ id, answer_summary: answer.trim() });
      if (res.error) {
        toast.error(res.error);
        return;
      }
      toast.success("Marcada como resuelta");
      router.refresh();
    });
  }

  return (
    <Card className="p-5">
      <div className="flex items-center justify-between mb-3">
        <div>
          <p className="text-sm font-medium flex items-center gap-2">
            <HelpCircle className="size-4 text-rose-500" />
            Preguntas abiertas ({unknowns.length})
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Cosas que no sabemos todavía. Cuando una pregunta tenga respuesta,
            marcala como resuelta + el brain la cierra.
          </p>
        </div>
        {!open && (
          <Button onClick={() => setOpen(true)} size="sm" variant="outline" className="gap-1.5">
            <Plus className="size-4" />
            Nueva
          </Button>
        )}
      </div>

      {open && (
        <div className="space-y-3 mb-4 p-3 rounded-lg border border-dashed border-rose-500/30 bg-rose-500/5">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium">Anotar pregunta abierta</p>
            <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
              <X className="size-4" />
            </Button>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Pregunta</Label>
            <Input
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="¿Cómo manejamos facturación multi-moneda?"
              autoFocus
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Contexto (opcional) — por qué importa</Label>
            <textarea
              value={context}
              onChange={(e) => setContext(e.target.value)}
              rows={2}
              maxLength={2000}
              placeholder="Nos preguntó un tenant brasileño si Stripe Connect soporta BRL…"
              className="w-full text-sm px-3 py-2 rounded-md border border-border bg-background"
            />
          </div>
          <div className="flex justify-end">
            <Button onClick={handleAdd} disabled={pending} size="sm" className="gap-1.5">
              {pending ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
              Registrar
            </Button>
          </div>
        </div>
      )}

      {unknowns.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-4">
          Sin preguntas abiertas. (Esto casi nunca es verdad — anotá lo que no sabés)
        </p>
      ) : (
        <div className="space-y-2">
          {unknowns.map((u) => (
            <div
              key={u.id}
              className="flex items-start justify-between gap-2 p-3 rounded-md bg-secondary/30 border border-border"
            >
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium">{u.question}</p>
                {u.context && (
                  <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{u.context}</p>
                )}
                <p className="text-xs text-muted-foreground mt-1">
                  {new Date(u.raised_at).toLocaleDateString("es-BO")}
                </p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleResolve(u.id)}
                disabled={resolving}
                className="shrink-0 gap-1"
                title="Marcar como resuelta"
              >
                <CheckCircle2 className="size-4 text-primary" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
