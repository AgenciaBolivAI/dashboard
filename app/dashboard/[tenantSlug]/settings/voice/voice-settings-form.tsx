"use client";

import { useActionState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import {
  updateVoiceSettingsAction,
  type VoiceActionState,
} from "@/lib/actions/voice";
import type { CuratedVoice } from "@/lib/voices";

const initial: VoiceActionState = { error: null };

export function VoiceSettingsForm({
  tenantId,
  currentVoiceId,
  currentGreeting,
  voices,
}: {
  tenantId: string;
  currentVoiceId: string;
  currentGreeting: string;
  voices: CuratedVoice[];
}) {
  const t = useTranslations("settings_voice");
  const [state, action, pending] = useActionState(
    updateVoiceSettingsAction,
    initial,
  );

  useEffect(() => {
    if (state.error) toast.error(state.error);
    if (state.success) toast.success(t("toast_changes_saved"));
  }, [state, t]);

  const grouped = {
    female: voices.filter((v) => v.gender === "female"),
    male: voices.filter((v) => v.gender === "male"),
  };

  return (
    <form action={action} className="space-y-5">
      <input type="hidden" name="tenant_id" value={tenantId} />

      <div className="space-y-2">
        <Label htmlFor="voice_id">{t("field_agent_voice")}</Label>
        <select
          id="voice_id"
          name="voice_id"
          defaultValue={currentVoiceId}
          className={cn(
            "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm",
            "ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
          )}
        >
          <optgroup label={t("voices_female")}>
            {grouped.female.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name} — {v.description}
              </option>
            ))}
          </optgroup>
          <optgroup label={t("voices_male")}>
            {grouped.male.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name} — {v.description}
              </option>
            ))}
          </optgroup>
        </select>
        <p className="text-xs text-muted-foreground">
          {t("voices_multilingual_note")}
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="voice_greeting">{t("field_greeting")}</Label>
        <textarea
          id="voice_greeting"
          name="voice_greeting"
          defaultValue={currentGreeting}
          rows={2}
          placeholder={t("greeting_placeholder")}
          className={cn(
            "flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm",
            "ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 resize-y",
          )}
        />
        <p className="text-xs text-muted-foreground">
          {t("greeting_hint")}
        </p>
      </div>

      <Button type="submit" disabled={pending}>
        {pending ? t("saving") : t("save_changes")}
      </Button>
    </form>
  );
}
