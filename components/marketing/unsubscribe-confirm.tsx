"use client";

import { useState } from "react";
import { Loader2, CheckCircle2 } from "lucide-react";
import { unsubCopy } from "@/lib/marketing/unsubscribe-copy";

export function UnsubscribeConfirm({
  token,
  language,
  businessName,
  maskedAddress,
}: {
  token: string;
  language: string;
  businessName: string | null;
  maskedAddress: string;
}) {
  const copy = unsubCopy(language);
  const [state, setState] = useState<"idle" | "loading" | "done" | "error">("idle");

  async function confirm() {
    setState("loading");
    try {
      const res = await fetch("/api/marketing/unsubscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      setState(res.ok ? "done" : "error");
    } catch {
      setState("error");
    }
  }

  if (state === "done") {
    return (
      <div className="mt-5 flex flex-col items-center">
        <CheckCircle2 className="size-10 text-emerald-500 mb-3" />
        <p className="text-sm">{copy.done}</p>
      </div>
    );
  }

  return (
    <div className="mt-4">
      <p className="text-sm text-muted-foreground">
        {copy.prompt.replace("{business}", businessName || "—")}
      </p>
      <p className="mt-1 text-xs text-muted-foreground">{maskedAddress}</p>
      <button
        type="button"
        onClick={confirm}
        disabled={state === "loading"}
        className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-md bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
      >
        {state === "loading" ? <Loader2 className="size-4 animate-spin" /> : null}
        {state === "loading" ? copy.processing : copy.confirm}
      </button>
      {state === "error" ? <p className="mt-3 text-xs text-red-500">{copy.invalid}</p> : null}
    </div>
  );
}
