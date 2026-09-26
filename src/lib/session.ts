import type { SupabaseClient, User } from '@supabase/supabase-js';
import { createClient } from './supabase/server';

export interface SessionProfile {
  role?: string | null;
  admin_level?: string | null;
  full_name?: string | null;
  email?: string | null;
  [key: string]: unknown;
}

export interface Session {
  signedIn: boolean;
  /** The verified account — null when nobody is signed in. */
  user: User | null;
  /** Their profile row, null when they have none. */
  profile: SessionProfile | null;
}

/**
 * Who is signed in — asked once per request, not once per asker.
 *
 * This is the first thing every page, layout and route does, and it used to
 * cost two round trips to Supabase each time it was asked: verify the token,
 * then read the profile. Nothing asked only once. A member screen asked in its
 * layout and again in the page; an admin screen asked in the guard and then
 * again inside the route; a dashboard firing six requests at once paid for all
 * of it six times. That, and not the database, was where the waiting went —
 * every query behind these screens answers in about a quarter of a second,
 * while the screens themselves took two to four.
 */

/**
 * Sessions already established, keyed by the access token that proved them.
 *
 * The key is the token itself, so one person's answer can never be handed to
 * another, and a token that has never been verified is not in here to begin
 * with — presenting a forged one misses and still has to face `getUser()`.
 * What is stored is the in-flight promise rather than its result, so requests
 * arriving together share one verification instead of racing to repeat it.
 *
 * The cost is staleness: a change of role can go unfelt for up to TTL_MS, and
 * on a platform running several instances, that long on each of them. Writes
 * that change somebody's standing call `forgetSessions()`, so the window is
 * the backstop rather than the mechanism.
 */
const TTL_MS = 15_000;
const CAPACITY = 500;
const established = new Map<string, { at: number; work: Promise<Session> }>();

const NOBODY: Session = { signedIn: false, user: null, profile: null };

function remember(token: string, work: Promise<Session>) {
  if (established.size >= CAPACITY) {
    const now = Date.now();
    for (const [key, entry] of established) if (now - entry.at >= TTL_MS) established.delete(key);
    if (established.size >= CAPACITY) established.clear();
  }
  established.set(token, { at: Date.now(), work });
  // A verification that threw must not be left behind as an answer.
  void work.catch(() => established.delete(token));
}

/** Forget every established session. Called when a role or standing changes. */
export function forgetSessions() {
  established.clear();
}

/*
 * The profile, with the role it holds and everything that role grants, in one
 * query. Asking separately would put the permission lookup back on the request
 * path that lib/session exists to keep clear.
 *
 * The embed needs the tables from 0025. Until that migration runs PostgREST
 * rejects the whole select, so a rejection falls back to the plain profile and
 * the caller works from the old level — the same way every other feature here
 * waits for its SQL rather than taking the portal down.
 */
const WITH_ROLE = '*, roles ( id, name, is_master, role_capabilities ( capability ) )';

async function verify(supabase: SupabaseClient): Promise<Session> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NOBODY;

  const joined = await supabase.from('profiles').select(WITH_ROLE).eq('id', user.id).single();

  const { data } = joined.error
    ? await supabase.from('profiles').select('*').eq('id', user.id).single()
    : joined;

  return { signedIn: true, user, profile: (data as SessionProfile | null) ?? null };
}

/** The current session, and a Supabase client bound to this request. */
export async function currentSession(): Promise<{ supabase: SupabaseClient } & Session> {
  const supabase = await createClient();

  // Reads the cookie; no network call. It serves only as the cache key — see
  // above for why presenting an unverified token cannot get anybody in.
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const token = session?.access_token;
  if (!token) return { supabase, ...NOBODY };

  const seen = established.get(token);
  if (seen && Date.now() - seen.at < TTL_MS) return { supabase, ...(await seen.work) };

  const work = verify(supabase);
  remember(token, work);
  return { supabase, ...(await work) };
}
