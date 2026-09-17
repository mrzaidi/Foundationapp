'use client';

import { useEffect, useMemo, useState } from 'react';
import Icon from './Icon';
import { useI18n } from './LocaleProvider';
import { fundText } from '@/lib/funds';
import { money } from '@/lib/format';
import { NEED_EXAMPLES, suggestFunds } from '@/lib/fund-match';
import type { FundType } from '@/lib/types';

const ASK = {
  en: {
    label: 'What do you need help with?',
    placeholder: 'Describe it in your own words…',
    suggested: 'This looks like the one',
    others: 'Or choose yourself',
    none: 'Nothing matched that. Choose from the list below.',
  },
  ur: {
    label: 'آپ کو کس چیز میں مدد چاہیے؟',
    placeholder: 'اپنے الفاظ میں لکھیں…',
    suggested: 'غالباً یہی درست ہے',
    others: 'یا خود منتخب کریں',
    none: 'کچھ مطابقت نہیں ملی۔ نیچے دی گئی فہرست میں سے منتخب کریں۔',
  },
} as const;

/**
 * Opened by the "Apply" button in the navigation. The dashboard already shows
 * the funds, but Apply is reachable from every screen — so it has to carry the
 * choice with it rather than bouncing the member back to the dashboard.
 */
export default function FundPicker({
  open,
  funds,
  onPick,
  onClose,
}: {
  open: boolean;
  funds: FundType[];
  onPick: (fund: FundType) => void;
  onClose: () => void;
}) {
  const { d, locale } = useI18n();
  const ask = ASK[locale === 'ur' ? 'ur' : 'en'];

  const [need, setNeed] = useState('');
  const suggestions = useMemo(() => suggestFunds(need, funds), [need, funds]);
  const suggestedIds = new Set(suggestions.map((s) => s.fund.id));

  // A fresh sheet should not open still holding the last person's sentence.
  useEffect(() => {
    if (!open) setNeed('');
  }, [open]);

  const row = (f: FundType, suggested = false) => {
    const t = fundText(f, locale);
    const max = f.max_amount ? Number(f.max_amount) : null;
    return (
      <button
        key={`${suggested ? 'sug-' : ''}${f.id}`}
        type="button"
        className={`picker-item ${suggested ? 'suggested' : ''}`}
        onClick={() => onPick(f)}
      >
        <span className={`pi-ico ${f.gradient}`}>
          <Icon name={f.icon} />
        </span>
        <span className="pi-text">
          <span className="pi-name">{t.name}</span>
          <span className="pi-desc">{t.description}</span>
          <span className="pi-range num">
            {max
              ? d.apply.range(money(Number(f.min_amount)), money(max))
              : d.apply.from(money(Number(f.min_amount)))}
          </span>
        </span>
        <span className="pi-chev">
          <Icon name="chevronRight" />
        </span>
      </button>
    );
  };

  return (
    <>
      <div className={`backdrop ${open ? 'open' : ''}`} onClick={onClose} />

      <div
        className={`sheet picker ${open ? 'open' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label={d.dashboard.applyHeading}
      >
        <div className="grab" />
        <div className="sheet-body">
          <div className="sheet-head">
            <div className="ico g-brand">
              <Icon name="wallet" />
            </div>
            <div style={{ flex: 1 }}>
              <h3>{d.dashboard.applyHeading}</h3>
              <p>{d.picker.lede}</p>
            </div>
            <button className="icon-btn dark" onClick={onClose} aria-label={d.common.close} type="button">
              <Icon name="x" />
            </button>
          </div>

          {/*
            Somebody arriving with a problem does not think in the foundation's
            categories — they think "bijli ka bill" or "my son's school". They
            say it here and the fund that fits is offered; the full list stays
            underneath, so this only ever helps and never decides.
          */}
          {funds.length > 1 && (
            <div className="need-box">
              <label htmlFor="need_what">{ask.label}</label>
              <input
                id="need_what"
                className="input"
                value={need}
                onChange={(e) => setNeed(e.target.value)}
                placeholder={ask.placeholder}
                autoComplete="off"
              />
              <div className="need-eg">
                {NEED_EXAMPLES[locale === 'ur' ? 'ur' : 'en'].map((e) => (
                  <button key={e} type="button" onClick={() => setNeed(e)}>
                    {e}
                  </button>
                ))}
              </div>
            </div>
          )}

          {need.trim().length >= 2 && suggestions.length > 0 && (
            <div className="picker-group">
              <div className="pg-head">
                <Icon name="bolt" />
                {ask.suggested}
              </div>
              <div className="picker-list">{suggestions.map((s) => row(s.fund, true))}</div>
            </div>
          )}

          {need.trim().length >= 2 && suggestions.length === 0 && (
            <p className="need-none">{ask.none}</p>
          )}

          <div className="picker-group">
            {suggestions.length > 0 && need.trim().length >= 2 && (
              <div className="pg-head plain">{ask.others}</div>
            )}
            <div className="picker-list">
              {funds.filter((f) => !suggestedIds.has(f.id)).map((f) => row(f))}
            </div>
          </div>

          {funds.length === 0 && <p className="muted center">{d.dashboard.noFunds}</p>}
        </div>
      </div>
    </>
  );
}
