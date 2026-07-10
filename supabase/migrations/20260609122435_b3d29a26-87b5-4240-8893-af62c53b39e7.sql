
-- User roles enum and table
CREATE TYPE public.app_role AS ENUM ('admin', 'artist', 'user');

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

-- Security definer function for role checks
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

-- Trigger to auto-create profile on signup
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

-- Playlists table
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

-- Playlist songs junction
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

-- Purchases table
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

-- Subscriptions table
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

-- Updated_at triggers
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
