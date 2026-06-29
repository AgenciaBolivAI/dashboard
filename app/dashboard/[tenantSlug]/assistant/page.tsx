import { randomUUID } from "crypto";
import { Sparkles } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { getTenantBySlug } from "@/lib/tenant";
import { getUser } from "@/lib/auth";
import { getAssistantHistory, listAssistantSessions } from "@/lib/queries/assistant";
import { getBolivBriefing } from "@/lib/queries/briefing";
import { AssistantChat } from "@/components/assistant/assistant-chat";

export const dynamic = "force-dynamic";

export default async function AssistantPage({
  params,
}: {
  params: Promise<{ tenantSlug: string }>;
}) {
  const { tenantSlug } = await params;
  // Access is enforced by the tenant layout (requireTenantAccess).
  const tenant = await getTenantBySlug(tenantSlug);
  const t = await getTranslations("assistant");

  // Load the user's chat sessions + BOLIV's live snapshot. Open the most recent
  // session (or a fresh one if the user has none yet).
  const user = await getUser();
  const [sessions, briefing] = await Promise.all([
    user ? listAssistantSessions(tenant.id, user.id) : Promise.resolve([]),
    getBolivBriefing(tenant.id, user?.id ?? null),
  ]);
  const activeSessionId = sessions[0]?.session_id ?? randomUUID();
  const initialMessages =
    user && sessions[0] ? await getAssistantHistory(tenant.id, user.id, activeSessionId) : [];

  return (
    <div className="flex flex-col h-full">
      <div className="px-6 md:px-8 pt-6">
        <h1 className="text-2xl font-display font-extrabold tracking-tight flex items-center gap-2">
          <Sparkles className="size-6 text-primary" />
          {t("page_title")}
        </h1>
        <p className="text-sm text-muted-foreground mt-1">{t("page_subtitle")}</p>
      </div>
      <AssistantChat
        tenantSlug={tenantSlug}
        initialMessages={initialMessages}
        initialSessions={sessions}
        activeSessionId={activeSessionId}
        briefing={briefing}
      />
    </div>
  );
}
