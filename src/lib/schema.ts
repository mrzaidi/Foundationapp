import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Has a migration reached the database yet?
 *
 * Vercel deploys on every push; the SQL in supabase/migrations is applied by
 * hand. So a deploy reaches production before its migration does, and code that
 * assumes otherwise takes a working screen down — which is exactly what
 * happened when 0007 shipped ahead of its columns. Nothing here works around a
 * missing migration; it only decides whether the feature is switched on, so the
 * app behaves as it did before until the SQL runs and picks the feature up the
 * moment it does, with no redeploy.
 */

/** `true` is permanent — columns are not dropped. `false` is retried. */
const known = new Map<string, { ready: boolean; checkedAt: number }>();
const RETRY_MS = 30_000;

export async function columnReady(
  db: SupabaseClient,
  table: string,
  column: string
): Promise<boolean> {
  const key = `${table}.${column}`;
  const seen = known.get(key);
  if (seen?.ready) return true;
  if (seen && Date.now() - seen.checkedAt < RETRY_MS) return false;

  const { error } = await db.from(table).select(column).limit(1);
  const ready = !error;
  known.set(key, { ready, checkedAt: Date.now() });
  return ready;
}

/**
 * The same question asked of a row already in hand.
 *
 * PostgREST omits a column that does not exist and returns `null` for one that
 * is merely empty, so the key's presence separates "feature not provisioned"
 * from "not set" without a second round-trip.
 */
export function rowHasColumn(row: object | null | undefined, column: string): boolean {
  return Boolean(row && column in row);
}
