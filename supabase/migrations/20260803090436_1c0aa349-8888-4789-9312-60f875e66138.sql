-- User roles enum and table
CREATE TYPE public.app_role AS ENUM ('admin', 'artist', 'user', 'superadmin');

CREATE TABLE public.user_roles (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    role app_role NOT NULL,
    UNIQUE (user_id, role)
);

GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own roles" ON public.user_roles
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

-- Profiles table
CREATE TABLE public.profiles (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
    full_name text,
    avatar_url text,
    bio text,
    location text,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own profile" ON public.profiles
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Profiles are readable by all users" ON public.profiles
  FOR SELECT TO anon USING (true);

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (user_id, full_name)
  VALUES (new.id, coalesce(new.raw_user_meta_data->>'full_name', ''));
  RETURN new;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Artists table
CREATE TABLE public.artists (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
    name text NOT NULL,
    bio text,
    genre text,
    avatar_url text,
    verified boolean NOT NULL DEFAULT false,
    monthly_listeners integer NOT NULL DEFAULT 0,
    status text NOT NULL DEFAULT 'approved',
    social_links jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT ON public.artists TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.artists TO authenticated;
GRANT ALL ON public.artists TO service_role;

ALTER TABLE public.artists ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Artists are public" ON public.artists FOR SELECT TO anon USING (true);
CREATE POLICY "Artists can manage own profile" ON public.artists
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Admins can manage all artists" ON public.artists
  FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- Albums table
CREATE TABLE public.albums (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    artist_id uuid REFERENCES public.artists(id) ON DELETE CASCADE NOT NULL,
    title text NOT NULL,
    cover_url text,
    release_date date,
    genre text,
    description text,
    price numeric(10,2) DEFAULT 0,
    featured boolean NOT NULL DEFAULT false,
    created_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT ON public.albums TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.albums TO authenticated;
GRANT ALL ON public.albums TO service_role;

ALTER TABLE public.albums ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Albums are public" ON public.albums FOR SELECT TO anon USING (true);
CREATE POLICY "Artists can manage own albums" ON public.albums
  FOR ALL TO authenticated USING (
    EXISTS (SELECT 1 FROM public.artists WHERE id = albums.artist_id AND user_id = auth.uid())
  );
CREATE POLICY "Admins can manage all albums" ON public.albums
  FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- Songs table
CREATE TABLE public.songs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    artist_id uuid REFERENCES public.artists(id) ON DELETE CASCADE NOT NULL,
    album_id uuid REFERENCES public.albums(id) ON DELETE SET NULL,
    title text NOT NULL,
    duration integer,
    audio_url text,
    cover_url text,
    genre text,
    price numeric(10,2) DEFAULT 5.00,
    explicit boolean NOT NULL DEFAULT false,
    play_count integer NOT NULL DEFAULT 0,
    is_trending boolean NOT NULL DEFAULT false,
    status text NOT NULL DEFAULT 'approved',
    created_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT ON public.songs TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.songs TO authenticated;
GRANT ALL ON public.songs TO service_role;

ALTER TABLE public.songs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Songs are public" ON public.songs FOR SELECT TO anon USING (true);
CREATE POLICY "Artists can manage own songs" ON public.songs
  FOR ALL TO authenticated USING (
    EXISTS (SELECT 1 FROM public.artists WHERE id = songs.artist_id AND user_id = auth.uid())
  );
CREATE POLICY "Admins can manage all songs" ON public.songs
  FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- Playlists
CREATE TABLE public.playlists (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    name text NOT NULL,
    description text,
    cover_url text,
    is_public boolean NOT NULL DEFAULT false,
    created_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT ON public.playlists TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.playlists TO authenticated;
GRANT ALL ON public.playlists TO service_role;

ALTER TABLE public.playlists ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read public playlists" ON public.playlists
  FOR SELECT TO anon USING (is_public = true);
CREATE POLICY "Users can manage own playlists" ON public.playlists
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE public.playlist_songs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    playlist_id uuid REFERENCES public.playlists(id) ON DELETE CASCADE NOT NULL,
    song_id uuid REFERENCES public.songs(id) ON DELETE CASCADE NOT NULL,
    position integer NOT NULL DEFAULT 0,
    added_at timestamp with time zone NOT NULL DEFAULT now(),
    UNIQUE (playlist_id, song_id)
);

GRANT SELECT ON public.playlist_songs TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.playlist_songs TO authenticated;
GRANT ALL ON public.playlist_songs TO service_role;

ALTER TABLE public.playlist_songs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read public playlist songs" ON public.playlist_songs
  FOR SELECT TO anon USING (
    EXISTS (SELECT 1 FROM public.playlists WHERE id = playlist_id AND is_public = true)
  );
CREATE POLICY "Users can manage own playlist songs" ON public.playlist_songs
  FOR ALL TO authenticated USING (
    EXISTS (SELECT 1 FROM public.playlists WHERE id = playlist_id AND user_id = auth.uid())
  );

-- Purchases
CREATE TABLE public.purchases (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    song_id uuid REFERENCES public.songs(id) ON DELETE SET NULL,
    album_id uuid REFERENCES public.albums(id) ON DELETE SET NULL,
    amount numeric(10,2) NOT NULL,
    payment_method text NOT NULL DEFAULT 'mtn_momo',
    status text NOT NULL DEFAULT 'pending',
    transaction_ref text,
    created_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.purchases TO authenticated;
GRANT ALL ON public.purchases TO service_role;

ALTER TABLE public.purchases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own purchases" ON public.purchases
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can create own purchases" ON public.purchases
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

-- Subscriptions
CREATE TABLE public.subscriptions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    plan text NOT NULL DEFAULT 'free',
    status text NOT NULL DEFAULT 'active',
    started_at timestamp with time zone NOT NULL DEFAULT now(),
    expires_at timestamp with time zone,
    payment_method text,
    auto_renew boolean NOT NULL DEFAULT false,
    created_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.subscriptions TO authenticated;
GRANT ALL ON public.subscriptions TO service_role;

ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own subscription" ON public.subscriptions
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users insert own subscription" ON public.subscriptions
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own subscription" ON public.subscriptions
  FOR UPDATE TO authenticated USING (auth.uid() = user_id);

-- updated_at helper
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_artists_updated_at BEFORE UPDATE ON public.artists
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS current_subscription_id uuid;

-- subscription_plans
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

-- payment_methods
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

-- payment_transactions
CREATE TABLE IF NOT EXISTS public.payment_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  amount numeric(10,2) NOT NULL,
  currency text NOT NULL DEFAULT 'ZMW',
  method_code text NOT NULL,
  provider text NOT NULL DEFAULT 'lenco',
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
CREATE POLICY "Users update own transactions" ON public.payment_transactions FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Admins view all transactions" ON public.payment_transactions FOR SELECT TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
CREATE TRIGGER trg_tx_updated BEFORE UPDATE ON public.payment_transactions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Storage RLS
CREATE POLICY "album-art read auth" ON storage.objects FOR SELECT TO authenticated, anon
  USING (bucket_id = 'album-art');
CREATE POLICY "album-art artists upload" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'album-art' AND EXISTS (SELECT 1 FROM public.artists WHERE artists.user_id = auth.uid() AND artists.id::text = (storage.foldername(name))[1]));
CREATE POLICY "album-art artists update" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'album-art' AND EXISTS (SELECT 1 FROM public.artists WHERE artists.user_id = auth.uid() AND artists.id::text = (storage.foldername(name))[1]));
CREATE POLICY "album-art artists delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'album-art' AND EXISTS (SELECT 1 FROM public.artists WHERE artists.user_id = auth.uid() AND artists.id::text = (storage.foldername(name))[1]));

CREATE POLICY "artist-images read" ON storage.objects FOR SELECT TO authenticated, anon
  USING (bucket_id = 'artist-images');
CREATE POLICY "artist-images own upload" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'artist-images' AND EXISTS (SELECT 1 FROM public.artists WHERE artists.user_id = auth.uid() AND artists.id::text = (storage.foldername(name))[1]));
CREATE POLICY "artist-images own update" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'artist-images' AND EXISTS (SELECT 1 FROM public.artists WHERE artists.user_id = auth.uid() AND artists.id::text = (storage.foldername(name))[1]));

CREATE POLICY "song-audio artists upload" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'song-audio' AND EXISTS (SELECT 1 FROM public.artists WHERE artists.user_id = auth.uid() AND artists.id::text = (storage.foldername(name))[1]));
CREATE POLICY "song-audio artists manage" ON storage.objects FOR ALL TO authenticated
  USING (bucket_id = 'song-audio' AND EXISTS (SELECT 1 FROM public.artists WHERE artists.user_id = auth.uid() AND artists.id::text = (storage.foldername(name))[1]))
  WITH CHECK (bucket_id = 'song-audio' AND EXISTS (SELECT 1 FROM public.artists WHERE artists.user_id = auth.uid() AND artists.id::text = (storage.foldername(name))[1]));

CREATE POLICY "user-avatars read" ON storage.objects FOR SELECT TO authenticated, anon
  USING (bucket_id = 'user-avatars');
CREATE POLICY "user-avatars own write" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'user-avatars' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "user-avatars own update" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'user-avatars' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "user-avatars own delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'user-avatars' AND auth.uid()::text = (storage.foldername(name))[1]);

-- Seed reference data
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

-- Staff helpers
CREATE OR REPLACE FUNCTION public.is_staff(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role IN ('admin','superadmin'))
$$;

CREATE OR REPLACE FUNCTION public.is_superadmin(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = 'superadmin')
$$;

-- platform_settings
CREATE TABLE IF NOT EXISTS public.platform_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id)
);
GRANT SELECT ON public.platform_settings TO anon, authenticated;
GRANT ALL ON public.platform_settings TO service_role;
ALTER TABLE public.platform_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read settings" ON public.platform_settings FOR SELECT USING (true);
CREATE POLICY "Superadmin manage settings" ON public.platform_settings
  FOR ALL TO authenticated USING (public.is_superadmin(auth.uid())) WITH CHECK (public.is_superadmin(auth.uid()));

INSERT INTO public.platform_settings (key, value) VALUES
  ('site', '{"name":"Wesu+","support_email":"support@wesu.app","commission_pct":15}'::jsonb),
  ('payments', '{"lenco_mode":"live"}'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- audit_log
CREATE TABLE IF NOT EXISTS public.audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid REFERENCES auth.users(id),
  action text NOT NULL,
  target_type text,
  target_id text,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.audit_log TO authenticated;
GRANT ALL ON public.audit_log TO service_role;
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff read audit" ON public.audit_log FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
CREATE INDEX IF NOT EXISTS audit_log_created_idx ON public.audit_log (created_at DESC);

-- song_likes
CREATE TABLE IF NOT EXISTS public.song_likes (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  song_id uuid NOT NULL REFERENCES public.songs(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, song_id)
);
GRANT SELECT, INSERT, DELETE ON public.song_likes TO authenticated;
GRANT SELECT ON public.song_likes TO anon;
GRANT ALL ON public.song_likes TO service_role;
ALTER TABLE public.song_likes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own likes" ON public.song_likes
  FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "Anyone reads like counts" ON public.song_likes FOR SELECT USING (true);

-- payouts
CREATE TABLE IF NOT EXISTS public.payouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  artist_id uuid NOT NULL REFERENCES public.artists(id) ON DELETE CASCADE,
  amount numeric(12,2) NOT NULL CHECK (amount > 0),
  method_code text NOT NULL,
  destination text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  notes text,
  requested_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  processed_by uuid REFERENCES auth.users(id)
);
GRANT SELECT, INSERT ON public.payouts TO authenticated;
GRANT ALL ON public.payouts TO service_role;
ALTER TABLE public.payouts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Artist sees own payouts" ON public.payouts
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.artists a WHERE a.id = artist_id AND a.user_id = auth.uid())
  );
CREATE POLICY "Artist creates own payouts" ON public.payouts
  FOR INSERT TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM public.artists a WHERE a.id = artist_id AND a.user_id = auth.uid())
  );
CREATE POLICY "Staff manage payouts" ON public.payouts
  FOR ALL TO authenticated USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));

-- Function execution hygiene
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.update_updated_at_column() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.is_staff(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.is_superadmin(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_staff(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_superadmin(uuid) TO authenticated;