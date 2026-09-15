'use client';

import Icon from './Icon';
import { useI18n } from './LocaleProvider';
import { BANK_GROUPS, checkAccount, isKnownBank } from '@/lib/banks';

export interface BankForm {
  bank_name: string;
  bank_account_number: string;
  bank_account_title: string;
}

export const EMPTY_BANK: BankForm = {
  bank_name: '',
  bank_account_number: '',
  bank_account_title: '',
};

/**
 * The same three fields in three places — registration, the profile, and the
 * gate in front of an application. Keeping them in one component means the
 * bank list and the IBAN rules cannot drift between the screen where a member
 * enters them and the screen where they fix a typo.
 */
export default function BankFields({
  value,
  onChange,
  errors = {},
  idPrefix = 'bank',
}: {
  value: BankForm;
  onChange: (next: BankForm) => void;
  errors?: Partial<Record<keyof BankForm, string>>;
  /** Distinct ids matter: the profile renders these while the apply sheet exists. */
  idPrefix?: string;
}) {
  const { d } = useI18n();
  const set = (k: keyof BankForm, v: string) => onChange({ ...value, [k]: v });

  return (
    <>
      <div className="field">
        <label htmlFor={`${idPrefix}_name`}>
          {d.bank.bank} <span className="req-star">*</span>
        </label>
        <select
          id={`${idPrefix}_name`}
          className={`input ${errors.bank_name ? 'err' : ''}`}
          value={value.bank_name}
          onChange={(e) => set('bank_name', e.target.value)}
        >
          <option value="">{d.bank.bankPlaceholder}</option>
          {BANK_GROUPS.map((g) => (
            <optgroup key={g.key} label={d.bank.groups[g.key]}>
              {g.banks.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
        {errors.bank_name && <p className="err-msg">{errors.bank_name}</p>}
      </div>

      <div className="field">
        <label htmlFor={`${idPrefix}_account`}>
          {d.bank.account} <span className="req-star">*</span>
        </label>
        <div className="input-icon">
          <Icon name="bank" />
          <input
            id={`${idPrefix}_account`}
            className={`input ${errors.bank_account_number ? 'err' : ''}`}
            dir="ltr"
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            placeholder={d.bank.accountPlaceholder}
            value={value.bank_account_number}
            onChange={(e) => set('bank_account_number', e.target.value.toUpperCase())}
          />
        </div>
        {errors.bank_account_number ? (
          <p className="err-msg">{errors.bank_account_number}</p>
        ) : (
          <p className="field-hint">{d.bank.accountHint}</p>
        )}
      </div>

      <div className="field mb-0">
        <label htmlFor={`${idPrefix}_holder`}>
          {d.bank.holder} <span className="req-star">*</span>
        </label>
        <div className="input-icon">
          <Icon name="user" />
          <input
            id={`${idPrefix}_holder`}
            className={`input ${errors.bank_account_title ? 'err' : ''}`}
            autoComplete="name"
            placeholder={d.bank.holderPlaceholder}
            value={value.bank_account_title}
            onChange={(e) => set('bank_account_title', e.target.value)}
          />
        </div>
        {errors.bank_account_title && <p className="err-msg">{errors.bank_account_title}</p>}
      </div>
    </>
  );
}

/**
 * Validation shared by every caller, returning dictionary-translated messages.
 * Exported as a hook because the messages come from the locale.
 */
export function useBankValidation() {
  const { d } = useI18n();

  return function validate(v: BankForm): Partial<Record<keyof BankForm, string>> {
    const e: Partial<Record<keyof BankForm, string>> = {};

    if (!v.bank_name.trim()) e.bank_name = d.bank.errors.bank;
    else if (!isKnownBank(v.bank_name)) e.bank_name = d.bank.errors.unknownBank;

    const problem = checkAccount(v.bank_account_number);
    if (problem) e.bank_account_number = d.bank.errors[problem];

    if (v.bank_account_title.trim().length < 3) e.bank_account_title = d.bank.errors.holder;

    return e;
  };
}
