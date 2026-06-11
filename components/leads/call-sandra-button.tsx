"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Phone, Loader2, Check, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { initiateSandraCallAction } from "@/lib/actions/voice";

/**
 * "Call now" button — triggers Sandra (via ElevenLabs) to phone the lead.
 *
 * Drop this into any row/card where you have:
 *  - tenant_id (uuid)
 *  - the lead's E.164 phone number (e.g. "+5491134567890")
 *  - optional context (name, company, role) to brief Sandra before the call
 *
 * After triggering, the user gets a toast with a link to ElevenLabs's
 * transcript page so they can listen back or read the conversation.
 */
export function CallSandraButton({
  tenantId,
  leadId,
  phone,
  leadName,
  leadCompany,
  leadRole,
  notes,
  size = "sm",
  variant = "outline",
}: {
  tenantId: string;
  /**
   * Lead UUID — forwarded to ElevenLabs as a dynamic variable so the
   * Sandra Tick can map this conversation back to the lead and auto-update
   * the lead's status after the call.
   */
  leadId?: string;
  phone: string | null | undefined;
  leadName?: string | null;
  leadCompany?: string | null;
  leadRole?: string | null;
  notes?: string | null;
  size?: "sm" | "default";
  variant?: "outline" | "default" | "ghost";
}) {
  const [pending, startCall] = useTransition();
  const [calledConvId, setCalledConvId] = useState<string | null>(null);

  // Try to read translations — fall back to English if the namespace
  // doesn't exist (so this component works in any locale even before its
  // strings are translated).
  let label = "Call with Sandra";
  let calling = "Calling…";
  let called = "Called";
  let toastSuccess = "Sandra is calling — check ElevenLabs for the conversation.";
  let toastNoPhone = "No phone number on file for this lead.";
  try {
    const t = useTranslations("leads");
    label = t("call_sandra");
    calling = t("calling");
    called = t("called");
    toastSuccess = t("call_sandra_success");
    toastNoPhone = t("call_sandra_no_phone");
  } catch { /* keys not yet translated — use fallbacks */ }

  function fire() {
    if (!phone || !/^\+[1-9]\d{1,14}$/.test(phone)) {
      toast.error(toastNoPhone);
      return;
    }
    startCall(async () => {
      const res = await initiateSandraCallAction({
        tenant_id: tenantId,
        to_number: phone,
        lead_id: leadId,
        context: {
          lead_name: leadName ?? undefined,
          lead_company: leadCompany ?? undefined,
          lead_role: leadRole ?? undefined,
          notes: notes ?? undefined,
        },
      });
      if (res.error) {
        toast.error(res.error);
        return;
      }
      setCalledConvId(res.conversation_id ?? "");
      toast.success(toastSuccess, {
        action: res.conversation_id
          ? {
              label: "View",
              onClick: () =>
                window.open(
                  `https://elevenlabs.io/app/conversational-ai/history/${res.conversation_id}`,
                  "_blank",
                ),
            }
          : undefined,
      });
    });
  }

  if (calledConvId !== null) {
    return (
      <Button
        size={size}
        variant="ghost"
        onClick={() =>
          calledConvId
            ? window.open(
                `https://elevenlabs.io/app/conversational-ai/history/${calledConvId}`,
                "_blank",
              )
            : undefined
        }
        className="gap-1.5 text-primary"
      >
        <Check className="size-4" />
        {called}
        {calledConvId && <ExternalLink className="size-3.5" />}
      </Button>
    );
  }

  return (
    <Button
      size={size}
      variant={variant}
      onClick={fire}
      disabled={pending || !phone}
      className="gap-1.5"
      title={phone ?? toastNoPhone}
    >
      {pending ? (
        <Loader2 className="size-4 animate-spin" />
      ) : (
        <Phone className="size-4" />
      )}
      {pending ? calling : label}
    </Button>
  );
}
