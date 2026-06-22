/**
 * Customer import field list — a PLAIN module (no "use server"). A Server
 * Actions file may only export async functions, so this array can't live in
 * lib/actions/customers.ts (it throws "use server file can only export async
 * functions, found object" once pulled into a server-action graph).
 */
export const IMPORTABLE_CUSTOMER_FIELDS = [
  "name",
  "whatsapp_number",
  "email",
  "business_name",
  "point_of_contact",
  "notes",
] as const;
export type ImportableCustomerField = (typeof IMPORTABLE_CUSTOMER_FIELDS)[number];
