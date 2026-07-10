
DO $$
DECLARE
  v_artist uuid := '705ecd1a-be01-4f33-bb67-22c1c6398368';
  v_alb1 uuid;
  v_alb2 uuid;
BEGIN
  IF EXISTS (SELECT 1 FROM public.songs WHERE artist_id = v_artist) THEN
    RETURN;
  END IF;

  INSERT INTO public.albums (artist_id, title, cover_url, genre, description, price, status, featured, release_date)
  VALUES (v_artist, 'Sunset Sessions', 'https://picsum.photos/seed/sunset/600/600', 'Afrobeats', 'Warm evening grooves.', 9.99, 'approved', true, CURRENT_DATE)
  RETURNING id INTO v_alb1;

  INSERT INTO public.albums (artist_id, title, cover_url, genre, description, price, status, featured, release_date)
  VALUES (v_artist, 'Midnight Frequencies', 'https://picsum.photos/seed/midnight/600/600', 'Electronic', 'Late-night electronic set.', 7.99, 'approved', false, CURRENT_DATE)
  RETURNING id INTO v_alb2;

  INSERT INTO public.songs (artist_id, album_id, title, duration, audio_url, cover_url, genre, price, status, is_trending) VALUES
    (v_artist, v_alb1, 'Golden Hour',   198, 'https://cdn.pixabay.com/download/audio/2022/03/15/audio_1808fbf07a.mp3?filename=lofi-study-112191.mp3', 'https://picsum.photos/seed/golden/600/600', 'Afrobeats', 1.29, 'approved', true),
    (v_artist, v_alb1, 'Coastal Drive', 214, 'https://cdn.pixabay.com/download/audio/2021/11/25/audio_00fa5593f3.mp3?filename=the-best-jazz-club-in-new-orleans-164472.mp3', 'https://picsum.photos/seed/coastal/600/600', 'Afrobeats', 1.29, 'approved', false),
    (v_artist, v_alb1, 'Evening Bloom', 176, 'https://cdn.pixabay.com/download/audio/2022/10/25/audio_946bc5b74e.mp3?filename=chill-abstract-intention-12099.mp3', 'https://picsum.photos/seed/bloom/600/600', 'Afrobeats', 1.29, 'approved', false),
    (v_artist, v_alb2, 'Neon Pulse',    205, 'https://cdn.pixabay.com/download/audio/2022/08/04/audio_2dde668d05.mp3?filename=powerful-beat-121791.mp3', 'https://picsum.photos/seed/neon/600/600', 'Electronic', 1.49, 'approved', true),
    (v_artist, v_alb2, 'Skyline',       232, 'https://cdn.pixabay.com/download/audio/2023/02/28/audio_550d815fde.mp3?filename=chill-lofi-song-138780.mp3', 'https://picsum.photos/seed/skyline/600/600', 'Electronic', 1.49, 'approved', false),
    (v_artist, NULL,   'Free Single',   187, 'https://cdn.pixabay.com/download/audio/2022/05/27/audio_1808fbf07a.mp3?filename=lofi-chill-medium-version-159456.mp3', 'https://picsum.photos/seed/free/600/600', 'Pop', 0, 'approved', true);
END $$;
