"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Loader2, Save, MessageSquare, Megaphone, Headphones } from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { updateVoicePersonaAction } from "@/lib/actions/voice";
import type { VoicePersona } from "@/lib/voice/persona";
import { cn } from "@/lib/utils";

const LANGUAGES = [
  { code: "es", label: "Español" },
  { code: "en", label: "English" },
  { code: "pt", label: "Português" },
  { code: "fr", label: "Français" },
  { code: "it", label: "Italiano" },
];

export function VoicePersonaEditor({
  tenantId,
  initial,
}: {
  tenantId: string;
  initial: VoicePersona;
}) {
  const router = useRouter();
  const t = useTranslations("settings_voice");
  const [pending, startTransition] = useTransition();
  const [p, setP] = useState<VoicePersona>(initial);

  function patch(updater: (prev: VoicePersona) => VoicePersona) {
    setP(updater);
  }

  function save() {
    startTransition(async () => {
      const res = await updateVoicePersonaAction({
        tenant_id: tenantId,
        persona: p,
      });
      if (res.error) {
        toast.error(res.error);
        return;
      }
      toast.success(t("persona_saved_toast"));
      router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      {/* Shared identity */}
      <Card className="p-6 space-y-4">
        <div>
          <p className="font-semibold flex items-center gap-2">
            <MessageSquare className="size-4 text-primary" />
            {t("identity_title")}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {t("identity_description")}
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label className="text-xs">{t("field_business_name")}</Label>
            <Input
              value={p.business_name ?? ""}
              onChange={(e) => patch((x) => ({ ...x, business_name: e.target.value }))}
              placeholder={t("field_business_name_placeholder")}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">{t("field_primary_language")}</Label>
            <select
              value={p.language ?? "es"}
              onChange={(e) => patch((x) => ({ ...x, language: e.target.value }))}
              className={cn(
                "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm",
                "ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              )}
            >
              {LANGUAGES.map((l) => (
                <option key={l.code} value={l.code}>{l.label}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs">{t("field_business_description")}</Label>
          <textarea
            value={p.business_description ?? ""}
            onChange={(e) => patch((x) => ({ ...x, business_description: e.target.value }))}
            rows={3}
            placeholder={t("field_business_description_placeholder")}
            className={cn(
              "flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm",
              "ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-y",
            )}
          />
        </div>
      </Card>

      {/* Sandra */}
      <Card className="p-6 space-y-4">
        <div>
          <p className="font-semibold flex items-center gap-2">
            <Megaphone className="size-4 text-orange-500" />
            {t("sandra_card_title")}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {t("sandra_card_description")}
          </p>
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs">{t("field_first_message")}</Label>
          <Input
            value={p.sandra?.first_message ?? ""}
            onChange={(e) =>
              patch((x) => ({ ...x, sandra: { ...x.sandra, first_message: e.target.value } }))
            }
            placeholder={t("sandra_first_message_placeholder", { business: p.business_name ?? t("your_business_fallback") })}
          />
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs">{t("field_value_prop")}</Label>
          <textarea
            value={p.sandra?.value_prop ?? ""}
            onChange={(e) =>
              patch((x) => ({ ...x, sandra: { ...x.sandra, value_prop: e.target.value } }))
            }
            rows={3}
            placeholder={t("field_value_prop_placeholder")}
            className={cn(
              "flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm",
              "ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-y",
            )}
          />
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs">{t("sandra_forbidden_label")}</Label>
          <textarea
            value={p.sandra?.forbidden_topics ?? ""}
            onChange={(e) =>
              patch((x) => ({ ...x, sandra: { ...x.sandra, forbidden_topics: e.target.value } }))
            }
            rows={2}
            placeholder={t("sandra_forbidden_placeholder")}
            className={cn(
              "flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm",
              "ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-y",
            )}
          />
        </div>
      </Card>

      {/* Rebecca */}
      <Card className="p-6 space-y-4">
        <div>
          <p className="font-semibold flex items-center gap-2">
            <Headphones className="size-4 text-cyan-500" />
            {t("rebecca_card_title")}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {t("rebecca_card_description")}
          </p>
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs">{t("field_first_message")}</Label>
          <Input
            value={p.rebecca?.first_message ?? ""}
            onChange={(e) =>
              patch((x) => ({ ...x, rebecca: { ...x.rebecca, first_message: e.target.value } }))
            }
            placeholder={t("rebecca_first_message_placeholder", { business: p.business_name ?? t("your_business_fallback") })}
          />
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs">{t("rebecca_faq_label")}</Label>
          <textarea
            value={p.rebecca?.faq ?? ""}
            onChange={(e) =>
              patch((x) => ({ ...x, rebecca: { ...x.rebecca, faq: e.target.value } }))
            }
            rows={6}
            placeholder={t("rebecca_faq_placeholder")}
            className={cn(
              "flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm",
              "ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-y",
            )}
          />
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs">{t("rebecca_forbidden_label")}</Label>
          <textarea
            value={p.rebecca?.forbidden_topics ?? ""}
            onChange={(e) =>
              patch((x) => ({ ...x, rebecca: { ...x.rebecca, forbidden_topics: e.target.value } }))
            }
            rows={2}
            placeholder={t("rebecca_forbidden_placeholder")}
            className={cn(
              "flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm",
              "ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-y",
            )}
          />
        </div>
      </Card>

      <div className="flex justify-end">
        <Button onClick={save} disabled={pending} size="lg" className="gap-2">
          {pending ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
          {t("save_persona")}
        </Button>
      </div>
    </div>
  );
}
