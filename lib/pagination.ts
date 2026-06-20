/**
 * Pagination constants + helpers shared by the SERVER pages (which read
 * page/pageSize from searchParams during render) and the CLIENT <Pagination>
 * component.
 *
 * This MUST be a plain module (no "use client"). Exporting `clampPageSize` from
 * the client component turned it into an uncallable client reference, so the
 * server pages crashed when they called it during render.
 */
export const PAGE_SIZE_OPTIONS = [25, 50, 100, 200] as const;
export const DEFAULT_PAGE_SIZE = 50;

/** Clamp an arbitrary page-size to one of the allowed options. */
export function clampPageSize(
  raw: number | undefined,
  fallback: number = DEFAULT_PAGE_SIZE,
): number {
  if (!raw) return fallback;
  return (PAGE_SIZE_OPTIONS as readonly number[]).includes(raw) ? raw : fallback;
}
