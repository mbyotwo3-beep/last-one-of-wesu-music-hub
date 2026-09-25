-- Fold modern-genre variants into the canonical list (follow-up to
-- 20260925000000_normalize_song_genres.sql, which already ran). Same shape:
-- whitespace cleanup is covered by the trim trigger; this file only maps
-- the newly added canonical categories and their variants.
-- Afro Pop
update public.songs set genre = 'Afro Pop' where lower(genre) in ('afro pop', 'afropop', 'afro-pop');
update public.albums set genre = 'Afro Pop' where lower(genre) in ('afro pop', 'afropop', 'afro-pop');
update public.artists set genre = 'Afro Pop' where lower(genre) in ('afro pop', 'afropop', 'afro-pop');
-- Afro House
update public.songs set genre = 'Afro House' where lower(genre) in ('afro house', 'afrohouse', 'afro-house');
update public.albums set genre = 'Afro House' where lower(genre) in ('afro house', 'afrohouse', 'afro-house');
update public.artists set genre = 'Afro House' where lower(genre) in ('afro house', 'afrohouse', 'afro-house');
-- Drill
update public.songs set genre = 'Drill' where lower(genre) = 'drill';
update public.albums set genre = 'Drill' where lower(genre) = 'drill';
update public.artists set genre = 'Drill' where lower(genre) = 'drill';
-- Trap
update public.songs set genre = 'Trap' where lower(genre) = 'trap';
update public.albums set genre = 'Trap' where lower(genre) = 'trap';
update public.artists set genre = 'Trap' where lower(genre) = 'trap';
-- EDM
update public.songs set genre = 'EDM' where lower(genre) in ('edm', 'electronic');
update public.albums set genre = 'EDM' where lower(genre) in ('edm', 'electronic');
update public.artists set genre = 'EDM' where lower(genre) in ('edm', 'electronic');
-- Gqom
update public.songs set genre = 'Gqom' where lower(genre) = 'gqom';
update public.albums set genre = 'Gqom' where lower(genre) = 'gqom';
update public.artists set genre = 'Gqom' where lower(genre) = 'gqom';
-- Bongo Flava
update public.songs set genre = 'Bongo Flava' where lower(genre) in ('bongo flava', 'bongoflava');
update public.albums set genre = 'Bongo Flava' where lower(genre) in ('bongo flava', 'bongoflava');
update public.artists set genre = 'Bongo Flava' where lower(genre) in ('bongo flava', 'bongoflava');
-- Highlife
update public.songs set genre = 'Highlife' where lower(genre) = 'highlife';
update public.albums set genre = 'Highlife' where lower(genre) = 'highlife';
update public.artists set genre = 'Highlife' where lower(genre) = 'highlife';
-- Zamrock
update public.songs set genre = 'Zamrock' where lower(genre) = 'zamrock';
update public.albums set genre = 'Zamrock' where lower(genre) = 'zamrock';
update public.artists set genre = 'Zamrock' where lower(genre) = 'zamrock';
-- Alternative
update public.songs set genre = 'Alternative' where lower(genre) in ('alternative', 'alt');
update public.albums set genre = 'Alternative' where lower(genre) in ('alternative', 'alt');
update public.artists set genre = 'Alternative' where lower(genre) in ('alternative', 'alt');
-- Indie
update public.songs set genre = 'Indie' where lower(genre) = 'indie';
update public.albums set genre = 'Indie' where lower(genre) = 'indie';
update public.artists set genre = 'Indie' where lower(genre) = 'indie';
-- Lo-Fi
update public.songs set genre = 'Lo-Fi' where lower(genre) in ('lo-fi', 'lofi');
update public.albums set genre = 'Lo-Fi' where lower(genre) in ('lo-fi', 'lofi');
update public.artists set genre = 'Lo-Fi' where lower(genre) in ('lo-fi', 'lofi');
-- Comedy
update public.songs set genre = 'Comedy' where lower(genre) = 'comedy';
update public.albums set genre = 'Comedy' where lower(genre) = 'comedy';
update public.artists set genre = 'Comedy' where lower(genre) = 'comedy';
-- Kizomba
update public.songs set genre = 'Kizomba' where lower(genre) = 'kizomba';
update public.albums set genre = 'Kizomba' where lower(genre) = 'kizomba';
update public.artists set genre = 'Kizomba' where lower(genre) = 'kizomba';
