"use client";

import { useTransition } from "react";
import { Hand, Bot } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { takeoverAction, releaseAction } from "@/lib/actions/hitl";

export function HitlControls({
  conversationId,
  isHitl,
}: {
  conversationId: string;
  isHitl: boolean;
}) {
  const [pending, startTransition] = useTransition();

  function handle(action: typeof takeoverAction | typeof releaseAction) {
    startTransition(async () => {
      const res = await action(conversationId);
      if (res.error) toast.error(res.error);
    });
  }

  if (isHitl) {
    return (
      <Button
        variant="outline"
        size="sm"
        disabled={pending}
        onClick={() => handle(releaseAction)}
      >
        <Bot className="size-4" />
        {pending ? "Liberando…" : "Devolver al bot"}
      </Button>
    );
  }

  return (
    <Button
      variant="outline"
      size="sm"
      disabled={pending}
      onClick={() => handle(takeoverAction)}
    >
      <Hand className="size-4" />
      {pending ? "Tomando control…" : "Tomar control"}
    </Button>
  );
}
