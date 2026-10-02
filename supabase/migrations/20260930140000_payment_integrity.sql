-- ============================================================================
-- Payment hardening.
--
-- 1) provider_token must identify exactly one transaction. The webhook falls
--    back to looking a row up by provider_token and by provider_ref; with no
--    unique index, a duplicate delivery could resolve to an arbitrary
--    transaction and settle the WRONG order.
--
-- 2) Money columns are numeric(12,2) already, but the values written are
--    rounded in application code. A CHECK makes that a database guarantee
--    rather than a convention, so no future code path can store a float tail
--    and have it reach the ledger or a payout.
-- ============================================================================

-- 1) Uniqueness for webhook lookups. Partial + unique, so many NULL tokens
--    (card rows that never got one) are still allowed.
CREATE UNIQUE INDEX IF NOT EXISTS payment_transactions_provider_token_uniq
  ON public.payment_transactions (provider_token)
  WHERE provider_token IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS payment_transactions_provider_ref_uniq
  ON public.payment_transactions (provider_ref)
  WHERE provider_ref IS NOT NULL;

-- 2) Money precision, enforced.
ALTER TABLE public.payment_transactions
  DROP CONSTRAINT IF EXISTS payment_transactions_amount_scale;
ALTER TABLE public.payment_transactions
  ADD CONSTRAINT payment_transactions_amount_scale
  CHECK (amount IS NULL OR amount = round(amount, 2));

ALTER TABLE public.purchases
  DROP CONSTRAINT IF EXISTS purchases_amount_scale;
ALTER TABLE public.purchases
  ADD CONSTRAINT purchases_amount_scale
  CHECK (amount IS NULL OR amount = round(amount, 2));

-- 3) A completed transaction must record what was paid, so a disputed
--    collection can be reconciled without guessing.
ALTER TABLE public.payment_transactions
  DROP CONSTRAINT IF EXISTS payment_transactions_positive_amount;
ALTER TABLE public.payment_transactions
  ADD CONSTRAINT payment_transactions_positive_amount
  CHECK (amount IS NULL OR amount >= 0);
