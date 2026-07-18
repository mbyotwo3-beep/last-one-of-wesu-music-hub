-- Seed Lenco payment methods with correct v2 operator codes.
-- Using ON CONFLICT so re-running is safe.
INSERT INTO public.payment_methods (code, label, category, lenco_operator, is_enabled, sort_order)
VALUES
  ('mtn_momo',   'MTN Mobile Money',    'mobile_money', 'mtn',    true, 10),
  ('airtel_money','Airtel Money',       'mobile_money', 'airtel', true, 20),
  ('zamtel_kwacha','Zamtel Kwacha',     'mobile_money', 'zamtel', true, 30),
  ('card',       'Debit / Credit Card', 'card',         NULL,     true, 40)
ON CONFLICT (code) DO UPDATE
  SET label         = EXCLUDED.label,
      category      = EXCLUDED.category,
      lenco_operator= EXCLUDED.lenco_operator,
      is_enabled    = EXCLUDED.is_enabled,
      sort_order    = EXCLUDED.sort_order;