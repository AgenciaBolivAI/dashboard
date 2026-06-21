"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { MessageSquare, ClipboardList } from "lucide-react";
import { OnboardingChat } from "./onboarding-chat";
import { OnboardingWizard } from "./wizard";

/**
 * Onboarding entry point. Defaults to BOLIV's conversational onboarding; a small
 * toggle falls back to the classic form (zero-risk if the LLM is unavailable,
 * and for users who prefer a form). Both paths converge on provisionTenant.
 */
export function OnboardingEntry({ userEmail }: { userEmail: string }) {
  const t = useTranslations("onboarding");
  const [mode, setMode] = useState<"chat" | "form">("chat");

  return (
    <div className="min-h-screen flex flex-col">
      <div className="flex-1">
        {mode === "chat" ? <OnboardingChat /> : <OnboardingWizard userEmail={userEmail} />}
      </div>
      <div className="text-center pb-6">
        <button
          type="button"
          onClick={() => setMode(mode === "chat" ? "form" : "chat")}
          className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition"
        >
          {mode === "chat" ? (
            <>
              <ClipboardList className="size-3.5" />
              {t("prefer_form")}
            </>
          ) : (
            <>
              <MessageSquare className="size-3.5" />
              {t("prefer_chat")}
            </>
          )}
        </button>
      </div>
    </div>
  );
}
