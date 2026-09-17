'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
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
  bankEnabled,
  children,
}: {
  profile: Profile;
  funds: FundType[];
  /** False until migration 0007 has run — then there is nowhere to save one. */
  bankEnabled: boolean;
  children: React.ReactNode;
}) {
  const [picking, setPicking] = useState(false);
  const [active, setActive] = useState<FundType | null>(null);
  // A fund chosen from the picker skips the confirm step — it was just chosen.
  const [skipConfirm, setSkipConfirm] = useState(false);
  // Bank details can be added inside the flow, so this outlives the server prop.
  const [bankOnFile, setBankOnFile] = useState(() => hasBankDetails(profile));
  // Asking for details the database cannot store would dead-end the member.
  const gateOnBank = bankEnabled && !bankOnFile;

  const openPicker = useCallback(() => setPicking(true), []);

  const startFund = useCallback((fund: FundType) => {
    setSkipConfirm(false);
    setActive(fund);
  }, []);

  const api = useMemo<ApplyApi>(() => ({ openPicker, startFund }), [openPicker, startFund]);

  /*
   * Mark the document while the apply flow is open.
   *
   * The assistant is a floating panel and the apply sheet is a floating panel,
   * and nothing stopped both being open at once — the chat's message box ended
   * up drawn across the middle of the application form, over the questions it
   * was asking. They are both full-screen on a phone, so only one can be the
   * thing in front: CSS takes this and puts the assistant away while an
   * application is being made.
   */
  const applyOpen = picking || active !== null;
  useEffect(() => {
    const root = document.documentElement;
    if (applyOpen) root.setAttribute('data-apply-open', '1');
    else root.removeAttribute('data-apply-open');
    return () => root.removeAttribute('data-apply-open');
  }, [applyOpen]);

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
        hasBank={!gateOnBank}
        onBankSaved={() => setBankOnFile(true)}
        startAt={skipConfirm ? 'form' : 'confirm'}
        onClose={() => setActive(null)}
      />
    </Ctx.Provider>
  );
}
