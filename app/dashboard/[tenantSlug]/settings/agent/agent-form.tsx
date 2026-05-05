"use client";

import { useActionState, useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { updateTenantAgentAction, type TenantState } from "@/lib/actions/tenant";

const initial: TenantState = { error: null };

type Variable = { key: string; value: string };

function objectToList(obj: Record<string, unknown>): Variable[] {
  return Object.entries(obj).map(([key, value]) => ({
    key,
    value: typeof value === "string" ? value : JSON.stringify(value),
  }));
}

function listToObject(list: Variable[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const { key, value } of list) {
    if (key.trim()) out[key.trim()] = value;
  }
  return out;
}

export function AgentForm({
  tenantId,
  promptTemplate,
  promptVariables,
}: {
  tenantId: string;
  promptTemplate: string;
  promptVariables: Record<string, unknown>;
}) {
  const [state, action, pending] = useActionState(updateTenantAgentAction, initial);
  const [variables, setVariables] = useState<Variable[]>(
    objectToList(promptVariables),
  );

  useEffect(() => {
    if (state.error) toast.error(state.error);
    if (state.success) toast.success("Prompt actualizado");
  }, [state]);

  function updateVar(idx: number, field: "key" | "value", val: string) {
    setVariables((prev) =>
      prev.map((v, i) => (i === idx ? { ...v, [field]: val } : v)),
    );
  }

  function removeVar(idx: number) {
    setVariables((prev) => prev.filter((_, i) => i !== idx));
  }

  function addVar() {
    setVariables((prev) => [...prev, { key: "", value: "" }]);
  }

  return (
    <form action={action} className="space-y-6">
      <input type="hidden" name="tenant_id" value={tenantId} />
      <input
        type="hidden"
        name="prompt_variables"
        value={JSON.stringify(listToObject(variables))}
      />

      <div className="space-y-2">
        <Label htmlFor="prompt_template">Plantilla del prompt</Label>
        <textarea
          id="prompt_template"
          name="prompt_template"
          rows={20}
          defaultValue={promptTemplate}
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono leading-relaxed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          placeholder="# Rol&#10;Eres {{agent_name}}, recepcionista de {{company_name}}..."
        />
        <p className="text-xs text-muted-foreground">
          Tip: empieza con un bloque <code>## Personalidad</code> y otro{" "}
          <code>## Reglas</code>. Define la lengua, el tono, qué nunca decir.
        </p>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label>Variables del prompt</Label>
          <Button type="button" variant="ghost" size="sm" onClick={addVar}>
            <Plus className="size-4" />
            Añadir
          </Button>
        </div>

        {variables.length === 0 ? (
          <p className="text-xs text-muted-foreground italic py-3">
            Sin variables. Usa el botón de arriba para añadir{" "}
            <code>company_name</code>, <code>agent_name</code>, etc.
          </p>
        ) : (
          <div className="space-y-2">
            {variables.map((v, i) => (
              <div key={i} className="flex items-center gap-2">
                <Input
                  placeholder="nombre"
                  value={v.key}
                  onChange={(e) => updateVar(i, "key", e.target.value)}
                  className="font-mono w-44 shrink-0"
                />
                <Input
                  placeholder="valor"
                  value={v.value}
                  onChange={(e) => updateVar(i, "value", e.target.value)}
                  className="flex-1"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => removeVar(i)}
                  className="shrink-0 text-muted-foreground hover:text-destructive"
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>

      <Button type="submit" disabled={pending}>
        {pending ? "Guardando…" : "Guardar prompt"}
      </Button>
    </form>
  );
}
