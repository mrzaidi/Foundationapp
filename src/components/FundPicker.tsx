'use client';

import Icon from './Icon';
import { useI18n } from './LocaleProvider';
import { fundText } from '@/lib/funds';
import { money } from '@/lib/format';
import type { FundType } from '@/lib/types';

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

          <div className="picker-list">
            {funds.map((f) => {
              const t = fundText(f, locale);
              const max = f.max_amount ? Number(f.max_amount) : null;
              return (
                <button
                  key={f.id}
                  type="button"
                  className="picker-item"
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
            })}
          </div>

          {funds.length === 0 && <p className="muted center">{d.dashboard.noFunds}</p>}
        </div>
      </div>
    </>
  );
}
