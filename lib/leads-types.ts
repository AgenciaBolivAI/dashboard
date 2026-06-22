export const LEAD_STATUSES = [
  "new",
  "contacted",
  "warm",            // Showed interest after first contact — keep nurturing
  "converted",       // Became a paying customer
  "not_interested",  // Declined politely — can be re-targeted later
  "do_not_contact",  // Explicit DNC — must never appear in any call/queue
  "lost",            // Legacy bucket; existing data may still use this
] as const;
export type LeadStatus = (typeof LEAD_STATUSES)[number];

/**
 * Leads that must NEVER be called, queued, or auto-contacted. The DNC list
 * is enforced in three places: addLeadsToSandraQueueAction (block),
 * CallSandraButton (hide), and AIMA's de-dupe (skip on re-scrape).
 */
export const DO_NOT_CONTACT_STATUSES: readonly LeadStatus[] = ["do_not_contact"];

export function isDoNotContact(status: string | null | undefined): boolean {
  return status === "do_not_contact";
}

/**
 * The pipeline stages shown as Kanban columns, in flow order. The terminal
 * non-pipeline states (not_interested / do_not_contact) are excluded from the
 * board — they still appear in the list view. `lost` is the closed-lost column.
 */
export const PIPELINE_STAGES: readonly LeadStatus[] = [
  "new",
  "contacted",
  "warm",
  "converted",
  "lost",
] as const;

/**
 * Win probability per stage, for the weighted pipeline forecast
 * (Σ value_cents × probability). 'converted' = won (1.0); closed-lost and the
 * terminal states = 0.
 */
export const STAGE_WIN_PROBABILITY: Record<LeadStatus, number> = {
  new: 0.1,
  contacted: 0.25,
  warm: 0.5,
  converted: 1,
  not_interested: 0,
  do_not_contact: 0,
  lost: 0,
};

/** A stage counts toward the OPEN (in-flight) pipeline if 0 < prob < 1. */
export function isOpenStage(status: string): boolean {
  const p = STAGE_WIN_PROBABILITY[status as LeadStatus];
  return p !== undefined && p > 0 && p < 1;
}

/**
 * Fields a CSV import can map onto a lead. MUST live in this plain module (not
 * the "use server" lib/actions/leads.ts): a Server Actions file may only export
 * async functions — exporting this array there throws "use server file can only
 * export async functions, found object" once it's pulled into a server graph.
 */
export const IMPORTABLE_LEAD_FIELDS = [
  "name",
  "whatsapp_number",
  "email",
  "intent",
  "notes",
  "status",
  "source",
  "vertical",
  "city",
  "website",
  "address",
] as const;
export type ImportableLeadField = (typeof IMPORTABLE_LEAD_FIELDS)[number];
