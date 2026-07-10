-- Fast webhook lookup by provider_token for DPO Pay reconciliation
CREATE INDEX IF NOT EXISTS idx_payment_transactions_provider_token
  ON public.payment_transactions (provider_token)
  WHERE provider_token IS NOT NULL;
