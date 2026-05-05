export const LEAD_STATUSES = ["new", "contacted", "converted", "lost"] as const;
export type LeadStatus = (typeof LEAD_STATUSES)[number];
