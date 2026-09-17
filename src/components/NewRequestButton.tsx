'use client';

import Icon from './Icon';
import { useApply } from './ApplyProvider';
import { useI18n } from './LocaleProvider';

const LABEL = {
  en: { action: 'New request', hint: 'Tell us what you need and we will suggest the right fund' },
  ur: { action: 'نئی درخواست', hint: 'بتائیں کیا چاہیے، ہم درست فنڈ تجویز کر دیں گے' },
} as const;

/**
 * An obvious way to start an application, from the screen that lists them.
 *
 * The round "+" in the tab bar already opens the picker, but a plus with no
 * word next to it is only obvious to somebody who has been shown it once.
 * This is the same action spelled out, on the screen where a member is most
 * likely to be looking for it — having just checked an old application and
 * decided to make a new one.
 */
export default function NewRequestButton() {
  const { openPicker } = useApply();
  const { locale } = useI18n();
  const say = LABEL[locale === 'ur' ? 'ur' : 'en'];

  return (
    <button type="button" className="new-request" onClick={openPicker}>
      <span className="nr-ico">
        <Icon name="plus" strokeWidth={2.4} />
      </span>
      <span className="nr-text">
        <span className="nr-action">{say.action}</span>
        <span className="nr-hint">{say.hint}</span>
      </span>
      <span className="nr-chev">
        <Icon name="chevronRight" />
      </span>
    </button>
  );
}
