"use client";

import { useEffect, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Loader2, Check, Save } from "lucide-react";
import { toast } from "sonner";
import { updateLeadNotesAction } from "@/lib/actions/leads";
import { cn } from "@/lib/utils";

/**
 * Editable notes for a lead. Autosaves 1.5s after the user stops typing,
 * and also lets them save explicitly with the button or ⌘/Ctrl + Enter.
 *
 * Persisted via updateLeadNotesAction which trims + nulls empty strings.
 */
export function LeadNotesEditor({
  tenantId,
  leadId,
  initialNotes,
}: {
  tenantId: string;
  leadId: string;
  initialNotes: string | null;
}) {
  const t = useTranslations("leads");
  const [notes, setNotes] = useState(initialNotes ?? "");
  const [saving, startSave] = useTransition();
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const [dirty, setDirty] = useState(false);

  // Debounced autosave
  useEffect(() => {
    if (!dirty) return;
    const handle = setTimeout(() => fire(), 1500);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notes, dirty]);

  function fire() {
    if (!dirty) return;
    startSave(async () => {
      const res = await updateLeadNotesAction(tenantId, leadId, notes);
      if (res.error) {
        toast.error(res.error);
        return;
      }
      setLastSavedAt(new Date());
      setDirty(false);
    });
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      fire();
    }
  }

  const placeholder = (() => {
    try {
      return t("notes_placeholder");
    } catch {
      return "Notas internas sobre este lead. Cosas que recordar para la próxima llamada — fechas importantes, preferencias, qué evitar mencionar…";
    }
  })();

  return (
    <div className="space-y-2">
      <textarea
        value={notes}
        onChange={(e) => {
          setNotes(e.target.value);
          setDirty(true);
        }}
        onKeyDown={onKeyDown}
        rows={6}
        placeholder={placeholder}
        className={cn(
          "w-full text-sm leading-relaxed px-3 py-2 rounded-md border border-border bg-background",
          "focus:outline-none focus:ring-2 focus:ring-ring",
          dirty && "border-amber-500/40",
        )}
      />
      <div className="flex items-center justify-between text-xs">
        <div className="text-muted-foreground">
          {saving ? (
            <span className="inline-flex items-center gap-1">
              <Loader2 className="size-3 animate-spin" />
              {(() => {
                try { return t("notes_saving"); } catch { return "Guardando…"; }
              })()}
            </span>
          ) : dirty ? (
            <span className="text-amber-600">
              {(() => {
                try { return t("notes_unsaved"); } catch { return "Cambios sin guardar — ⌘/Ctrl + Enter para guardar"; }
              })()}
            </span>
          ) : lastSavedAt ? (
            <span className="inline-flex items-center gap-1 text-emerald-600">
              <Check className="size-3" />
              {(() => {
                try {
                  return t("notes_saved_at", {
                    time: lastSavedAt.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" }),
                  });
                } catch {
                  return `Guardado a las ${lastSavedAt.toLocaleTimeString()}`;
                }
              })()}
            </span>
          ) : (
            <span>
              {(() => {
                try { return t("notes_hint"); } catch { return "Autoguarda mientras escribís"; }
              })()}
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={fire}
          disabled={!dirty || saving}
          className={cn(
            "inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium transition",
            dirty && !saving
              ? "bg-primary text-primary-foreground hover:opacity-90"
              : "bg-secondary text-muted-foreground cursor-default",
          )}
        >
          <Save className="size-3" />
          {(() => {
            try { return t("notes_save_now"); } catch { return "Guardar"; }
          })()}
        </button>
      </div>
    </div>
  );
}
