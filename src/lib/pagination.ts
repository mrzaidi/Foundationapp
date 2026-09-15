/**
 * Shared by the server component that reads `?size=` and the client control
 * that writes it.
 *
 * It lives here rather than beside the control because a `'use client'` module
 * exports client references, not values — a server component importing this
 * array from there gets a proxy, and `PAGE_SIZES.includes` is not a function.
 */
export const PAGE_SIZES = [25, 50, 100] as const;

export const DEFAULT_PAGE_SIZE = PAGE_SIZES[0];

export function pageSizeOf(raw: string | undefined): number {
  const n = Number(raw);
  return (PAGE_SIZES as readonly number[]).includes(n) ? n : DEFAULT_PAGE_SIZE;
}
