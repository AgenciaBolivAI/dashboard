"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { MessageSquare } from "lucide-react";
import { OnboardingChat } from "./onboarding-chat";
import { OnboardingWizard } from "./wizard";

/**
 * Onboarding entry point. Defaults to BOLIV's conversational onboarding; a small
 * toggle falls back to the classic form (zero-risk if the LLM is unavailable,
 * and for users who prefer a form). Both paths converge on provisionTenant.
 *
 * Chat mode owns the full (dynamic) viewport itself — including the "prefer
 * form" toggle in its header — so the mobile keyboard never pushes the
 * conversation off-screen. The form mode scrolls naturally.
 */
export function OnboardingEntry({ userEmail }: { userEmail: string }) {
  const t = useTranslations("onboarding");
  const [mode, setMode] = useState<"chat" | "form">("chat");

  if (mode === "chat") {
    return <OnboardingChat onUseForm={() => setMode("form")} />;
  }

  return (
    <div className="flex min-h-[100dvh] flex-col">
      <div className="flex-1">
        <OnboardingWizard userEmail={userEmail} />
      </div>
      <div className="text-center pb-6 pt-2">
        <button
          type="button"
          onClick={() => setMode("chat")}
          className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition"
        >
          <MessageSquare className="size-3.5" />
          {t("prefer_chat")}
        </button>
      </div>
    </div>
  );
}
