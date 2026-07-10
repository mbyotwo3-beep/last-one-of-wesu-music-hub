
-- ============ Column additions ============
ALTER TABLE public.artists ADD COLUMN IF NOT EXISTS monthly_listeners integer NOT NULL DEFAULT 0;
ALTER TABLE public.albums ADD COLUMN IF NOT EXISTS featured boolean NOT NULL DEFAULT false;
ALTER TABLE public.songs ADD COLUMN IF NOT EXISTS is_trending boolean NOT NULL DEFAULT false;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS current_subscription_id uuid;

-- ============ subscription_plans ============
CREATE TABLE IF NOT EXISTS public.subscription_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  price_zmw numeric(10,2) NOT NULL DEFAULT 0,
  interval text NOT NULL DEFAULT 'month',
  description text,
  features jsonb NOT NULL DEFAULT '[]'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.subscription_plans TO anon;
GRANT SELECT ON public.subscription_plans TO authenticated;
GRANT ALL ON public.subscription_plans TO service_role;
ALTER TABLE public.subscription_plans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Plans are public" ON public.subscription_plans FOR SELECT TO anon, authenticated USING (is_active = true);
CREATE POLICY "Admins manage plans" ON public.subscription_plans FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE TRIGGER trg_plans_updated BEFORE UPDATE ON public.subscription_plans
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ payment_methods ============
CREATE TABLE IF NOT EXISTS public.payment_methods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  label text NOT NULL,
  category text NOT NULL DEFAULT 'mobile_money',
  logo_url text,
  is_enabled boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.payment_methods TO anon;
GRANT SELECT ON public.payment_methods TO authenticated;
GRANT ALL ON public.payment_methods TO service_role;
ALTER TABLE public.payment_methods ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Payment methods public" ON public.payment_methods FOR SELECT TO anon, authenticated USING (is_enabled = true);
CREATE POLICY "Admins manage payment methods" ON public.payment_methods FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- ============ payment_transactions ============
CREATE TABLE IF NOT EXISTS public.payment_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  amount numeric(10,2) NOT NULL,
  currency text NOT NULL DEFAULT 'ZMW',
  method_code text NOT NULL,
  provider text NOT NULL DEFAULT 'dpo',
  provider_ref text,
  provider_token text,
  status text NOT NULL DEFAULT 'pending',
  item_type text NOT NULL,
  item_id uuid,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.payment_transactions TO authenticated;
GRANT ALL ON public.payment_transactions TO service_role;
ALTER TABLE public.payment_transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view own transactions" ON public.payment_transactions FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users create own transactions" ON public.payment_transactions FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Admins view all transactions" ON public.payment_transactions FOR SELECT TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
CREATE TRIGGER trg_tx_updated BEFORE UPDATE ON public.payment_transactions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ Missing policies on existing tables ============
-- subscriptions: users insert/update own
CREATE POLICY "Users insert own subscription" ON public.subscriptions FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own subscription" ON public.subscriptions FOR UPDATE TO authenticated USING (auth.uid() = user_id);

-- ============ Storage RLS on storage.objects ============
-- album-art: anyone authenticated can read; artist can upload to their own folder (artist_id prefix)
CREATE POLICY "album-art read auth" ON storage.objects FOR SELECT TO authenticated, anon
  USING (bucket_id = 'album-art');
CREATE POLICY "album-art artists upload" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'album-art' AND EXISTS (SELECT 1 FROM public.artists WHERE artists.user_id = auth.uid() AND artists.id::text = (storage.foldername(name))[1]));
CREATE POLICY "album-art artists update" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'album-art' AND EXISTS (SELECT 1 FROM public.artists WHERE artists.user_id = auth.uid() AND artists.id::text = (storage.foldername(name))[1]));
CREATE POLICY "album-art artists delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'album-art' AND EXISTS (SELECT 1 FROM public.artists WHERE artists.user_id = auth.uid() AND artists.id::text = (storage.foldername(name))[1]));

-- artist-images: same pattern
CREATE POLICY "artist-images read" ON storage.objects FOR SELECT TO authenticated, anon
  USING (bucket_id = 'artist-images');
CREATE POLICY "artist-images own upload" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'artist-images' AND EXISTS (SELECT 1 FROM public.artists WHERE artists.user_id = auth.uid() AND artists.id::text = (storage.foldername(name))[1]));
CREATE POLICY "artist-images own update" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'artist-images' AND EXISTS (SELECT 1 FROM public.artists WHERE artists.user_id = auth.uid() AND artists.id::text = (storage.foldername(name))[1]));

-- song-audio: artists upload to their own folder; reads are server-side only (no SELECT policy here; signed URLs minted by service role)
CREATE POLICY "song-audio artists upload" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'song-audio' AND EXISTS (SELECT 1 FROM public.artists WHERE artists.user_id = auth.uid() AND artists.id::text = (storage.foldername(name))[1]));
CREATE POLICY "song-audio artists manage" ON storage.objects FOR ALL TO authenticated
  USING (bucket_id = 'song-audio' AND EXISTS (SELECT 1 FROM public.artists WHERE artists.user_id = auth.uid() AND artists.id::text = (storage.foldername(name))[1]))
  WITH CHECK (bucket_id = 'song-audio' AND EXISTS (SELECT 1 FROM public.artists WHERE artists.user_id = auth.uid() AND artists.id::text = (storage.foldername(name))[1]));

-- user-avatars: users manage their own (user_id prefix)
CREATE POLICY "user-avatars read" ON storage.objects FOR SELECT TO authenticated, anon
  USING (bucket_id = 'user-avatars');
CREATE POLICY "user-avatars own write" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'user-avatars' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "user-avatars own update" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'user-avatars' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "user-avatars own delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'user-avatars' AND auth.uid()::text = (storage.foldername(name))[1]);

-- ============ Seed reference data ============
INSERT INTO public.subscription_plans (code, name, price_zmw, interval, description, features, sort_order) VALUES
  ('free', 'Free', 0, 'month', 'Listen with ads, standard audio quality',
    '["Ad-supported streaming","Standard quality audio","Create playlists","Limited skips"]'::jsonb, 1),
  ('premium_monthly', 'Premium Monthly', 79.99, 'month', 'Unlimited ad-free music',
    '["Ad-free streaming","High quality audio","Unlimited skips","Offline downloads","Exclusive content"]'::jsonb, 2),
  ('premium_yearly', 'Premium Yearly', 799.00, 'year', 'Save with annual billing',
    '["Everything in Premium","2 months free","Priority support"]'::jsonb, 3)
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.payment_methods (code, label, category, sort_order) VALUES
  ('mtn_momo', 'MTN MoMo', 'mobile_money', 1),
  ('airtel_money', 'Airtel Money', 'mobile_money', 2),
  ('zamtel_kwacha', 'Zamtel Kwacha', 'mobile_money', 3),
  ('visa', 'Visa', 'card', 4),
  ('mastercard', 'Mastercard', 'card', 5)
ON CONFLICT (code) DO NOTHING;
