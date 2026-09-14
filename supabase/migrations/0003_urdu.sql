-- ===========================================================================
-- Bilingual fund copy. The UI strings live in the app; the fund names,
-- descriptions and document labels live here because they are data.
-- ===========================================================================

alter table public.fund_types
  add column if not exists name_ur           text,
  add column if not exists description_ur    text,
  add column if not exists document_label_ur text;

update public.fund_types set
  name_ur           = 'ماہانہ فنڈ',
  description_ur    = 'رجسٹرڈ خاندانوں کے لیے ہر ماہ باقاعدہ امداد',
  document_label_ur = 'آمدنی یا ضرورت کا ثبوت (اختیاری)'
where id = 'monthly';

update public.fund_types set
  name_ur           = 'حادثاتی فنڈ',
  description_ur    = 'حادثے یا طبی ایمرجنسی کے بعد فوری مدد',
  document_label_ur = 'میڈیکل رپورٹ، نسخہ یا ہسپتال کا بل'
where id = 'accidental';

update public.fund_types set
  name_ur           = 'راشن فنڈ',
  description_ur    = 'گھریلو راشن اور اشیائے خوردونوش کی امداد',
  document_label_ur = 'راشن کا تخمینہ یا دکان کا بل'
where id = 'grocery';

update public.fund_types set
  name_ur           = 'بجلی بل فنڈ',
  description_ur    = 'بقایا بجلی کا بل ادا کرنے میں مدد',
  document_label_ur = 'تازہ ترین بجلی کا بل'
where id = 'electricity';
