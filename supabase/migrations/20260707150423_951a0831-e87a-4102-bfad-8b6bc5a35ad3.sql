ALTER TABLE public.payment_methods
  ADD COLUMN IF NOT EXISTS lenco_operator text;

UPDATE public.payment_methods SET lenco_operator = 'mtn-zambia'    WHERE code = 'mtn_momo';
UPDATE public.payment_methods SET lenco_operator = 'airtel-zambia' WHERE code = 'airtel_money';
UPDATE public.payment_methods SET lenco_operator = 'zamtel-zambia' WHERE code = 'zamtel_kwacha';

ALTER TABLE public.payment_transactions
  ALTER COLUMN provider SET DEFAULT 'lenco';