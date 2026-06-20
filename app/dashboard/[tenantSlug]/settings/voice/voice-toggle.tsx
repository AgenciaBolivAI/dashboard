"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { Mic, MicOff, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  enableVoiceAction,
  disableVoiceAction,
  deleteVoiceAgentAction,
} from "@/lib/actions/voice";

export function VoiceToggle({
  tenantId,
  enabled,
  hasAgent,
}: {
  tenantId: string;
  enabled: boolean;
  hasAgent: boolean;
}) {
  const t = useTranslations("settings_voice");
  const [pending, start] = useTransition();

  function handleEnable() {
    start(async () => {
      const res = await enableVoiceAction(tenantId);
      if (res.error) toast.error(res.error);
      else toast.success(hasAgent ? t("voice_reactivated") : t("voice_agent_created"));
    });
  }

  function handleDisable() {
    start(async () => {
      const res = await disableVoiceAction(tenantId);
      if (res.error) toast.error(res.error);
      else toast.success(t("voice_disabled"));
    });
  }

  function handleDelete() {
    if (!confirm(t("confirm_delete_agent"))) return;
    start(async () => {
      const res = await deleteVoiceAgentAction(tenantId);
      if (res.error) toast.error(res.error);
      else toast.success(t("agent_deleted"));
    });
  }

  return (
    <div className="flex flex-wrap gap-2">
      {enabled ? (
        <Button
          type="button"
          variant="outline"
          onClick={handleDisable}
          disabled={pending}
          className="text-muted-foreground"
        >
          {pending ? <Loader2 className="size-4 animate-spin" /> : <MicOff className="size-4" />}
          {t("disable_voice")}
        </Button>
      ) : (
        <Button type="button" onClick={handleEnable} disabled={pending}>
          {pending ? <Loader2 className="size-4 animate-spin" /> : <Mic className="size-4" />}
          {hasAgent ? t("reactivate_voice") : t("activate_voice")}
        </Button>
      )}
      {hasAgent ? (
        <Button
          type="button"
          variant="ghost"
          onClick={handleDelete}
          disabled={pending}
          className="text-muted-foreground hover:text-destructive"
        >
          {t("delete_agent")}
        </Button>
      ) : null}
    </div>
  );
}
