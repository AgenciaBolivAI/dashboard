/**
 * Intent labels and styling for the /leads view. The intent column
 * comes straight from the voice tool (capture_lead) and the WhatsApp
 * agent — values match the enum in lib/voice-tools/capture-lead.ts.
 *
 * Unknown values fall back to a humanised version of the raw key, so
 * adding new intents server-side won't break the UI.
 */

const INTENT_LABEL: Record<string, string> = {
  pricing_inquiry: "Precio",
  plan_comparison: "Comparar planes",
  demo_consideration: "Quiere demo",
  info_request: "Info general",
  white_label: "White label",
  enterprise: "Enterprise",
  support_escalation: "Escalación de soporte",
};

const INTENT_STYLE: Record<string, string> = {
  // High-priority — orange so it stands out next to the other badges.
  support_escalation:
    "border-orange-500/40 bg-orange-500/10 text-orange-600 dark:text-orange-300",
  // Hot prospect — green.
  demo_consideration:
    "border-green-500/40 bg-green-500/10 text-green-600 dark:text-green-300",
  // Pricing — primary.
  pricing_inquiry:
    "border-primary/40 bg-primary/10 text-primary",
  plan_comparison:
    "border-primary/40 bg-primary/10 text-primary",
  // Everything else: default outline (no extra class).
};

export function intentLabel(intent: string | null | undefined): string {
  if (!intent) return "—";
  return (
    INTENT_LABEL[intent] ??
    intent
      .replace(/_/g, " ")
      .replace(/\b\w/g, (c) => c.toUpperCase())
  );
}

export function intentBadgeClass(intent: string | null | undefined): string {
  if (!intent) return "";
  return INTENT_STYLE[intent] ?? "";
}
