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
