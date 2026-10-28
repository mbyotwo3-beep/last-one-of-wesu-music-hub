-- Hide media of artists who are not approved.
--
-- RULE (product decision): a suspended or rejected artist's songs and albums
-- disappear from every PUBLIC surface — shelves, search, browse, genre chips,
-- playlist embeds, the album page — but the media itself is KEPT so the
-- artist can reapply (re-agreeing to the T&C), get re-approved, and continue.
--
-- Who sees what:
--   anon (logged out)        -> approved artists only
--   authenticated listener   -> approved artists only
--   the artist (owner)       -> their own rows at ANY status (via user_id match)
--   admin / superadmin       -> everything (public.is_staff)
--
-- Enforcement at RLS is deliberate: every public read path — home shelves,
-- search, genres, playlists' song embeds, album detail — queries songs/albums
-- with the anon or a user token, so ONE policy change hides the media
-- everywhere at once, with no per-query filter to forget. Staff reads use the
-- service role (RLS bypassed) and artist-own reads match user_id, so both keep
-- full visibility.

-- ---------- SONGS ----------
DROP POLICY IF EXISTS "Songs approved public" ON public.songs;
CREATE POLICY "Songs approved public" ON public.songs
  FOR SELECT TO anon
  USING (
    status = 'approved'
    AND EXISTS (
      SELECT 1 FROM public.artists a
      WHERE a.id = songs.artist_id AND a.status = 'approved'
    )
  );

DROP POLICY IF EXISTS "Songs authenticated read" ON public.songs;
CREATE POLICY "Songs authenticated read" ON public.songs
  FOR SELECT TO authenticated
  USING (
    -- the artist who owns the song sees it at any status
    EXISTS (
      SELECT 1 FROM public.artists a
      WHERE a.id = songs.artist_id AND a.user_id = auth.uid()
    )
    OR private.is_staff(auth.uid())
    OR (
      status = 'approved'
      AND EXISTS (
        SELECT 1 FROM public.artists a
        WHERE a.id = songs.artist_id AND a.status = 'approved'
      )
    )
  );

-- ---------- ARTISTS (the row itself) ----------
-- A suspended/rejected artist also disappears from public artist lists and
-- their public page 404s for logged-out visitors. The row is KEPT so the
-- artist (owner) and staff still see it.
-- The authenticated policy also FIXES a pre-existing gap: listeners had no
-- way to read other artists' rows, so signed-in users got null artist names
-- on track cards and artist pages.
DROP POLICY IF EXISTS "Artists are public" ON public.artists;
CREATE POLICY "Artists are public" ON public.artists
  FOR SELECT TO anon
  USING (status = 'approved');

DROP POLICY IF EXISTS "Artists readable by authenticated" ON public.artists;
CREATE POLICY "Artists readable by authenticated" ON public.artists
  FOR SELECT TO authenticated
  USING (
    auth.uid() = user_id
    OR private.is_staff(auth.uid())
    OR status = 'approved'
  );

-- ---------- ALBUMS ----------
-- One policy serves anon AND authenticated here (as before); for anon,
-- auth.uid() is NULL so the owner/staff branches are simply false.
DROP POLICY IF EXISTS "Albums approved public" ON public.albums;
CREATE POLICY "Albums approved public" ON public.albums
  FOR SELECT TO anon, authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.artists a
      WHERE a.id = albums.artist_id AND a.user_id = auth.uid()
    )
    OR private.is_staff(auth.uid())
    OR (
      status = 'approved'
      AND EXISTS (
        SELECT 1 FROM public.artists a
        WHERE a.id = albums.artist_id AND a.status = 'approved'
      )
    )
  );
