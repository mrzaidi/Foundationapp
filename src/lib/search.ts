/**
 * Making a search box safe to paste a name into.
 *
 * Two different things get confused with a search term, and both have bitten
 * this codebase:
 *
 * 1. PostgREST's `or(...)` takes one string in which a comma starts the next
 *    clause and brackets group them. A member called "Khan, Ali" was ending
 *    the filter early.
 *
 * 2. `ilike` is a LIKE pattern, where % matches anything and _ matches one
 *    character. Searching "%" returned every household on file rather than
 *    none — not a leak, since the person could already see them, but the term
 *    was plainly not being treated as text.
 *
 * Neither is a way into the database — PostgREST parameterises the values and
 * RLS still decides which rows come back — but a search box should look for
 * what was typed into it.
 */

/** Characters that mean something to PostgREST's filter grammar. */
const SEPARATORS = /[,()"'\\]/g;

/** Characters that mean something to a LIKE pattern. */
const WILDCARDS = /[%_]/g;

/**
 * A term that will be looked for literally.
 *
 * Returns an empty string when nothing searchable is left, which callers
 * should read as "no filter" rather than "match nothing".
 */
export function searchTerm(raw: string | null | undefined): string {
  return (raw ?? '')
    .replace(SEPARATORS, ' ')
    .replace(WILDCARDS, (c) => `\\${c}`)
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * An `or(...)` filter across several columns, from a term already cleaned by
 * searchTerm. Pass the columns in the order a reader would expect to match.
 */
export function orIlike(columns: string[], term: string): string {
  return columns.map((c) => `${c}.ilike.%${term}%`).join(',');
}
