import type { SupabaseClient } from '@supabase/supabase-js';
import { columnReady, rowHasColumn } from './schema';

/**
 * Is the database ready for bank details yet?
 *
 * Vercel deploys on every push; the SQL in supabase/migrations is applied by
 * hand. So a deploy can reach production before its migration does, and code
 * that assumes otherwise takes the whole portal down — which is exactly what
 * happened when 0007 shipped ahead of its columns: registration died on an
 * insert into columns that did not exist.
 *
 * Nothing here works around a missing migration; it only decides whether the
 * feature is switched on. Until the columns exist the app behaves as it did
 * before the feature, and the moment they do it picks the requirement up
 * without a redeploy.
 */

export function bankColumnsReady(db: SupabaseClient): Promise<boolean> {
  return columnReady(db, 'profiles', 'bank_name');
}

/**
 * The same question asked of a row already in hand.
 *
 * PostgREST omits a column that does not exist and returns `null` for one that
 * is merely empty, so the key's presence separates "feature not provisioned"
 * from "member has not filled it in" without a second round-trip.
 */
export function rowHasBankColumns(row: object | null | undefined): boolean {
  return rowHasColumn(row, 'bank_name');
}
