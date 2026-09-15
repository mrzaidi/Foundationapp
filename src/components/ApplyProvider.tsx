'use client';

import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import ApplySheet from './ApplySheet';
import FundPicker from './FundPicker';
import { hasBankDetails } from '@/lib/banks';
import type { FundType, Profile } from '@/lib/types';

/**
 * The whole apply flow, owned once by the member layout.
 *
 * It used to hang off the URL: the "+" button pushed `/?apply=1` and the
 * dashboard opened the picker from an effect keyed on that param. That meant a
 * server round-trip for a local sheet — slow enough on a phone that people
 * tapped twice — and the second tap pushed a URL that was already current, so
 * the param never changed, the effect never re-fired, and the button stayed
 * dead until you navigated away and back. Plain client state has none of that,
 * and it works identically from every screen instead of bouncing to the
 * dashboard first.
 */
interface ApplyApi {
  /** Open the fund list — the "+" in the navigation. */
  openPicker: () => void;
  /** Go straight to one fund, confirming first — a dashboard fund card. */
  startFund: (fund: FundType) => void;
  /** True once the member has somewhere for money to land. */
  hasBank: boolean;
}

const Ctx = createContext<ApplyApi | null>(null);

export function useApply(): ApplyApi {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useApply must be used inside <ApplyProvider>.');
  return ctx;
}

export default function ApplyProvider({
  profile,
  funds,
  children,
}: {
  profile: Profile;
  funds: FundType[];
  children: React.ReactNode;
}) {
  const [picking, setPicking] = useState(false);
  const [active, setActive] = useState<FundType | null>(null);
  // A fund chosen from the picker skips the confirm step — it was just chosen.
  const [skipConfirm, setSkipConfirm] = useState(false);
  // Bank details can be added inside the flow, so this outlives the server prop.
  const [bankOnFile, setBankOnFile] = useState(() => hasBankDetails(profile));

  const openPicker = useCallback(() => setPicking(true), []);

  const startFund = useCallback((fund: FundType) => {
    setSkipConfirm(false);
    setActive(fund);
  }, []);

  const api = useMemo<ApplyApi>(
    () => ({ openPicker, startFund, hasBank: bankOnFile }),
    [openPicker, startFund, bankOnFile]
  );

  return (
    <Ctx.Provider value={api}>
      {children}

      <FundPicker
        open={picking}
        funds={funds}
        onClose={() => setPicking(false)}
        onPick={(f) => {
          setPicking(false);
          setSkipConfirm(true);
          setActive(f);
        }}
      />

      <ApplySheet
        fund={active}
        profile={profile}
        hasBank={bankOnFile}
        onBankSaved={() => setBankOnFile(true)}
        startAt={skipConfirm ? 'form' : 'confirm'}
        onClose={() => setActive(null)}
      />
    </Ctx.Provider>
  );
}
