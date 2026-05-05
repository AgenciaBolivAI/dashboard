"use client";

import { useActionState, useEffect, useRef } from "react";
import { Send } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { sendOperatorMessageAction, type HitlState } from "@/lib/actions/hitl";

const initial: HitlState = { error: null };

export function OperatorInput({ conversationId }: { conversationId: string }) {
  const [state, action, pending] = useActionState(sendOperatorMessageAction, initial);
  const formRef = useRef<HTMLFormElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (state.error) toast.error(state.error);
    if (state.clearForm) {
      formRef.current?.reset();
      textareaRef.current?.focus();
    }
  }, [state]);

  return (
    <form
      ref={formRef}
      action={action}
      className="border-t border-border bg-card px-4 py-3"
    >
      <input type="hidden" name="conversation_id" value={conversationId} />
      <div className="flex items-end gap-2">
        <textarea
          ref={textareaRef}
          name="text"
          rows={2}
          required
          maxLength={4000}
          placeholder="Escribe como operador…"
          className="flex-1 resize-none rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              formRef.current?.requestSubmit();
            }
          }}
        />
        <Button type="submit" size="icon" disabled={pending} className="shrink-0">
          <Send />
        </Button>
      </div>
      <p className="mt-1.5 text-[10px] text-muted-foreground">
        Enter para enviar · Shift+Enter para salto de línea · El bot está pausado
      </p>
    </form>
  );
}
