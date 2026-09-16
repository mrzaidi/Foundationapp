/**
 * What a rupee is worth today, in euros and dollars.
 *
 * The foundation reports to donors and auditors who do not think in rupees, so
 * every figure it publishes carries an indicative conversion. Indicative is the
 * operative word: these are reference rates, not a quote anybody can transact
 * on, so the timestamp travels with them and the UI says "approximately".
 *
 * Two providers, neither needing a key or an account:
 *   1. open.er-api.com — the open endpoint of ExchangeRate-API, quotes PKR.
 *   2. Fawaz Ahmed's currency-api on jsDelivr — a static JSON mirror.
 * The second exists because a welfare portal should not show a broken figure
 * because one free service is having a bad afternoon.
 */

export interface Rates {
  /** Multiply a PKR amount by these. */
  eur: number;
  usd: number;
  /** ISO date the provider last updated. */
  asOf: string;
  source: string;
}

const PRIMARY = 'https://open.er-api.com/v6/latest/PKR';
const FALLBACK =
  'https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/pkr.json';

/** Rates move slowly; an hour of staleness is cheaper than an hourly outage. */
const TTL_MS = 60 * 60 * 1000;
let cached: { at: number; rates: Rates } | null = null;

const sane = (n: unknown): n is number =>
  typeof n === 'number' && Number.isFinite(n) && n > 0 && n < 1;

async function fromPrimary(signal: AbortSignal): Promise<Rates | null> {
  const res = await fetch(PRIMARY, { signal, next: { revalidate: 3600 } });
  if (!res.ok) return null;

  const json = (await res.json()) as {
    result?: string;
    time_last_update_utc?: string;
    rates?: Record<string, number>;
  };
  if (json.result !== 'success' || !json.rates) return null;

  const { EUR, USD } = json.rates;
  if (!sane(EUR) || !sane(USD)) return null;

  return {
    eur: EUR,
    usd: USD,
    asOf: json.time_last_update_utc
      ? new Date(json.time_last_update_utc).toISOString().slice(0, 10)
      : new Date().toISOString().slice(0, 10),
    source: 'open.er-api.com',
  };
}

async function fromFallback(signal: AbortSignal): Promise<Rates | null> {
  const res = await fetch(FALLBACK, { signal, next: { revalidate: 3600 } });
  if (!res.ok) return null;

  const json = (await res.json()) as { date?: string; pkr?: Record<string, number> };
  const eur = json.pkr?.eur;
  const usd = json.pkr?.usd;
  if (!sane(eur) || !sane(usd)) return null;

  return {
    eur,
    usd,
    asOf: json.date ?? new Date().toISOString().slice(0, 10),
    source: 'currency-api',
  };
}

/**
 * Never throws and never blocks for long: a figure in rupees is still correct
 * without its conversion, so a dead provider costs the euro line, not the page.
 */
export async function getRates(): Promise<Rates | null> {
  if (cached && Date.now() - cached.at < TTL_MS) return cached.rates;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4000);

  try {
    for (const attempt of [fromPrimary, fromFallback]) {
      try {
        const rates = await attempt(controller.signal);
        if (rates) {
          cached = { at: Date.now(), rates };
          return rates;
        }
      } catch {
        // try the next provider
      }
    }
  } finally {
    clearTimeout(timer);
  }

  // Better a stale conversion, clearly dated, than none at all.
  return cached?.rates ?? null;
}

/** `PKR 250,000` → `€800` / `$870`, rounded — these are never exact. */
export function convert(pkr: number, rates: Rates) {
  return { eur: pkr * rates.eur, usd: pkr * rates.usd };
}

export function formatForeign(value: number, currency: 'EUR' | 'USD'): string {
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency,
    maximumFractionDigits: value >= 100 ? 0 : 2,
  }).format(value);
}
