'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import type { Rates } from '@/lib/rates';
import { convert, formatForeign } from '@/lib/rates';

const Ctx = createContext<Rates | null>(null);

/**
 * Fetches today's rates once and hands them to every amount on the page.
 *
 * One request per screen rather than one per figure, and a failure is simply an
 * absent context: children render rupees and say nothing about euros, which is
 * the right answer when nobody can tell you the rate.
 */
export function RatesProvider({ children }: { children: React.ReactNode }) {
  const [rates, setRates] = useState<Rates | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/rates');
        const json = await res.json();
        if (!cancelled && res.ok) setRates(json.rates ?? null);
      } catch {
        // rupees on their own are still correct
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return <Ctx.Provider value={rates}>{children}</Ctx.Provider>;
}

export function useRates() {
  return useContext(Ctx);
}

/**
 * The euro and dollar equivalent of a rupee amount.
 *
 * Deliberately marked approximate and never shown for zero: "≈ €0 · $0" is
 * noise, and a reference rate is not a quote anyone can transact on.
 */
export default function Fx({ pkr, className = '' }: { pkr: number; className?: string }) {
  const rates = useRates();
  if (!rates || !Number.isFinite(pkr) || pkr === 0) return null;

  const { eur, usd } = convert(Math.abs(pkr), rates);
  const sign = pkr < 0 ? '−' : '';

  return (
    <span
      className={`fx ${className}`.trim()}
      title={`Indicative, from ${rates.source} on ${rates.asOf}`}
    >
      ≈ {sign}
      {formatForeign(eur, 'EUR')} · {sign}
      {formatForeign(usd, 'USD')}
    </span>
  );
}

/** One line of provenance, so nobody reads these as a dealing rate. */
export function FxNote({ className = '' }: { className?: string }) {
  const rates = useRates();
  if (!rates) return null;

  // Quoted as rupees per euro, not euros per rupee: PKR 1 = €0.0031 rounds to
  // "€0.00" and tells nobody anything, while "€1 ≈ PKR 320" is the number
  // people in Karachi actually carry in their heads.
  const perEur = 1 / rates.eur;
  const perUsd = 1 / rates.usd;
  const pkr = (n: number) =>
    new Intl.NumberFormat('en-GB', { maximumFractionDigits: 2 }).format(n);

  return (
    <p className={`fx-note ${className}`.trim()}>
      Euro and dollar figures are indicative, converted at {rates.source}&rsquo;s rate of{' '}
      {rates.asOf} (&euro;1 &asymp; PKR {pkr(perEur)}, US$1 &asymp; PKR {pkr(perUsd)}). They are not
      a dealing rate.
    </p>
  );
}
