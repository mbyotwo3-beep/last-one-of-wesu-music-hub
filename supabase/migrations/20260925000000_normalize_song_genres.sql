-- Fold free-text genre variants into the canonical category list so each
-- category (e.g. Gospel) appears exactly once on browse shelves.
-- Matches normalizeGenre() in src/lib/genres.ts. Run once; all app writes
-- are normalized server-side from here on.

-- 1. Whitespace cleanup everywhere (trailing spaces, double spaces).
update public.songs set genre = trim(regexp_replace(genre, '\s+', ' ', 'g')) where genre is not null;
update public.albums set genre = trim(regexp_replace(genre, '\s+', ' ', 'g')) where genre is not null;
update public.artists set genre = trim(regexp_replace(genre, '\s+', ' ', 'g')) where genre is not null;

-- 2. Case + synonym folding. One statement per canonical value, applied to
-- songs, albums, and artists.
-- Gospel
update public.songs set genre = 'Gospel' where lower(genre) in ('gospel', 'gospel music', 'gospels');
update public.albums set genre = 'Gospel' where lower(genre) in ('gospel', 'gospel music', 'gospels');
update public.artists set genre = 'Gospel' where lower(genre) in ('gospel', 'gospel music', 'gospels');
-- Hip Hop
update public.songs set genre = 'Hip Hop' where lower(genre) in ('hip hop', 'hiphop', 'hip-hop', 'rap');
update public.albums set genre = 'Hip Hop' where lower(genre) in ('hip hop', 'hiphop', 'hip-hop', 'rap');
update public.artists set genre = 'Hip Hop' where lower(genre) in ('hip hop', 'hiphop', 'hip-hop', 'rap');
-- R&B
update public.songs set genre = 'R&B' where lower(genre) in ('r&b', 'r n b', 'rnb', 'rhythm and blues');
update public.albums set genre = 'R&B' where lower(genre) in ('r&b', 'r n b', 'rnb', 'rhythm and blues');
update public.artists set genre = 'R&B' where lower(genre) in ('r&b', 'r n b', 'rnb', 'rhythm and blues');
-- Afrobeat
update public.songs set genre = 'Afrobeat' where lower(genre) in ('afrobeat', 'afrobeats', 'afro beat', 'afro beats');
update public.albums set genre = 'Afrobeat' where lower(genre) in ('afrobeat', 'afrobeats', 'afro beat', 'afro beats');
update public.artists set genre = 'Afrobeat' where lower(genre) in ('afrobeat', 'afrobeats', 'afro beat', 'afro beats');
-- Amapiano
update public.songs set genre = 'Amapiano' where lower(genre) in ('amapiano', 'ama piano');
update public.albums set genre = 'Amapiano' where lower(genre) in ('amapiano', 'ama piano');
update public.artists set genre = 'Amapiano' where lower(genre) in ('amapiano', 'ama piano');
-- Kwasa Kwasa
update public.songs set genre = 'Kwasa Kwasa' where lower(genre) in ('kwasa kwasa', 'kwasa-kwasa', 'kwasakwasa', 'kwassa kwassa');
update public.albums set genre = 'Kwasa Kwasa' where lower(genre) in ('kwasa kwasa', 'kwasa-kwasa', 'kwasakwasa', 'kwassa kwassa');
update public.artists set genre = 'Kwasa Kwasa' where lower(genre) in ('kwasa kwasa', 'kwasa-kwasa', 'kwasakwasa', 'kwassa kwassa');
-- Rhumba
update public.songs set genre = 'Rhumba' where lower(genre) in ('rhumba', 'rumba');
update public.albums set genre = 'Rhumba' where lower(genre) in ('rhumba', 'rumba');
update public.artists set genre = 'Rhumba' where lower(genre) in ('rhumba', 'rumba');
-- Dancehall
update public.songs set genre = 'Dancehall' where lower(genre) in ('dancehall', 'dance hall');
update public.albums set genre = 'Dancehall' where lower(genre) in ('dancehall', 'dance hall');
update public.artists set genre = 'Dancehall' where lower(genre) in ('dancehall', 'dance hall');
-- Spoken Word
update public.songs set genre = 'Spoken Word' where lower(genre) in ('spoken word', 'spokenword', 'spoken-word');
update public.albums set genre = 'Spoken Word' where lower(genre) in ('spoken word', 'spokenword', 'spoken-word');
update public.artists set genre = 'Spoken Word' where lower(genre) in ('spoken word', 'spokenword', 'spoken-word');
-- Choir
update public.songs set genre = 'Choir' where lower(genre) in ('choir', 'choirs');
update public.albums set genre = 'Choir' where lower(genre) in ('choir', 'choirs');
update public.artists set genre = 'Choir' where lower(genre) in ('choir', 'choirs');
-- Worship
update public.songs set genre = 'Worship' where lower(genre) in ('worship');
update public.albums set genre = 'Worship' where lower(genre) in ('worship');
update public.artists set genre = 'Worship' where lower(genre) in ('worship');
-- Traditional
update public.songs set genre = 'Traditional' where lower(genre) in ('traditional', 'trad');
update public.albums set genre = 'Traditional' where lower(genre) in ('traditional', 'trad');
update public.artists set genre = 'Traditional' where lower(genre) in ('traditional', 'trad');
-- Single-word canonicals (case-only folding)
update public.songs set genre = 'Pop' where lower(genre) = 'pop';
update public.albums set genre = 'Pop' where lower(genre) = 'pop';
update public.artists set genre = 'Pop' where lower(genre) = 'pop';
update public.songs set genre = 'Rock' where lower(genre) = 'rock';
update public.albums set genre = 'Rock' where lower(genre) = 'rock';
update public.artists set genre = 'Rock' where lower(genre) = 'rock';
update public.songs set genre = 'Jazz' where lower(genre) = 'jazz';
update public.albums set genre = 'Jazz' where lower(genre) = 'jazz';
update public.artists set genre = 'Jazz' where lower(genre) = 'jazz';
update public.songs set genre = 'Soul' where lower(genre) = 'soul';
update public.albums set genre = 'Soul' where lower(genre) = 'soul';
update public.artists set genre = 'Soul' where lower(genre) = 'soul';
update public.songs set genre = 'Reggae' where lower(genre) = 'reggae';
update public.albums set genre = 'Reggae' where lower(genre) = 'reggae';
update public.artists set genre = 'Reggae' where lower(genre) = 'reggae';
update public.songs set genre = 'House' where lower(genre) = 'house';
update public.albums set genre = 'House' where lower(genre) = 'house';
update public.artists set genre = 'House' where lower(genre) = 'house';
update public.songs set genre = 'Country' where lower(genre) = 'country';
update public.albums set genre = 'Country' where lower(genre) = 'country';
update public.artists set genre = 'Country' where lower(genre) = 'country';
update public.songs set genre = 'Kalindula' where lower(genre) = 'kalindula';
update public.albums set genre = 'Kalindula' where lower(genre) = 'kalindula';
update public.artists set genre = 'Kalindula' where lower(genre) = 'kalindula';

-- 3. Backstop trigger: trim whitespace on write so "Gospel " can never
-- reappear (case/synonyms are normalized app-side on every write path).
create or replace function public.trim_genre()
returns trigger language plpgsql as $$
begin
  if new.genre is not null then
    new.genre := trim(regexp_replace(new.genre, '\s+', ' ', 'g'));
    if new.genre = '' then new.genre := null; end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_trim_song_genre on public.songs;
create trigger trg_trim_song_genre before insert or update of genre on public.songs
  for each row execute function public.trim_genre();

drop trigger if exists trg_trim_album_genre on public.albums;
create trigger trg_trim_album_genre before insert or update of genre on public.albums
  for each row execute function public.trim_genre();

drop trigger if exists trg_trim_artist_genre on public.artists;
create trigger trg_trim_artist_genre before insert or update of genre on public.artists
  for each row execute function public.trim_genre();
