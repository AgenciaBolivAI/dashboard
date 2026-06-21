/**
 * Permission vocabulary — the shared language for "who can do what" across the
 * whole platform (UI gating, server actions, and the AI tool registry).
 *
 * A permission is a (FEATURE, LEVEL) pair. Every server action, route, sidebar
 * link, and AI tool declares the permission it needs; a role is a map of
 * FEATURE → LEVEL. The AI tool registry uses this so a model is only ever
 * OFFERED — and only ever allowed to RUN — a tool the acting user could perform
 * by hand. Same code path as a human click, same gate.
 *
 * Today roles are the legacy tiers (viewer < member < operator < admin < owner,
 * plus bolivai_admin). Phase 4 RBAC adds custom roles that store an explicit
 * FEATURE → LEVEL map; it plugs into the SAME `levelSatisfies` / resolver, so
 * nothing here has to change — the legacy tiers become the seeded system roles.
 *
 * Plain module (no server-only deps) so it's safe to import from client
 * components for UI gating as well as from server code.
 */

// Mirror of lib/auth.ts EffectiveRole, declared locally to keep this module
// dependency-free (string unions are structurally compatible).
export type Role = "owner" | "admin" | "operator" | "viewer" | "member" | "bolivai_admin";

/** Every capability surface in the platform. Phase 4 RBAC keys roles by these. */
export const FEATURES = [
  "leads",
  "deals",
  "customers",
  "conversations",
  "tickets",
  "tasks",
  "calendar",
  "invoices",
  "knowledge",
  "marketing",
  "content",
  "shorts",
  "reports",
  "analytics",
  "billing",
  "team",
  "settings",
] as const;
export type Feature = (typeof FEATURES)[number];

/** Access levels, strictly ordered: none < read < edit < admin. */
export const LEVELS = ["none", "read", "edit", "admin"] as const;
export type Level = (typeof LEVELS)[number];

const LEVEL_RANK: Record<Level, number> = { none: 0, read: 1, edit: 2, admin: 3 };

/** True if `have` grants at least `need` (e.g. admin satisfies read). */
export function levelSatisfies(have: Level, need: Level): boolean {
  return LEVEL_RANK[have] >= LEVEL_RANK[need];
}

export type Permission = { feature: Feature; level: Level };
export type PermissionSet = Partial<Record<Feature, Level>>;

/** A PermissionSet with the same level on every feature. */
function fill(level: Level): PermissionSet {
  return Object.fromEntries(FEATURES.map((f) => [f, level])) as PermissionSet;
}

/**
 * Legacy tier → permission preset. These reproduce TODAY's behavior exactly so
 * the move to a permission model breaks nothing:
 *   - viewer / member  → read everywhere (no writes — matches "writes need
 *     operator+" today, since member < operator).
 *   - operator         → edit operational features; read-only on billing /
 *     team / settings (admin-only areas stay admin-only).
 *   - admin / owner / bolivai_admin → full admin on everything.
 * Phase 4 RBAC seeds these as the system roles, then lets tenants author custom
 * ones with arbitrary FEATURE → LEVEL maps.
 */
export const LEGACY_ROLE_PERMISSIONS: Record<Role, PermissionSet> = {
  viewer: fill("read"),
  member: fill("read"),
  operator: { ...fill("edit"), billing: "read", team: "read", settings: "read" },
  admin: fill("admin"),
  owner: fill("admin"),
  bolivai_admin: fill("admin"),
};

/** The permission map for a role (empty if the role is unknown/null). */
export function permissionsForRole(role: Role | null | undefined): PermissionSet {
  if (!role) return {};
  return LEGACY_ROLE_PERMISSIONS[role] ?? {};
}

/** True if `role` has at least `level` on `feature`. */
export function roleSatisfies(
  role: Role | null | undefined,
  feature: Feature,
  level: Level,
): boolean {
  const have = permissionsForRole(role)[feature] ?? "none";
  return levelSatisfies(have, level);
}
