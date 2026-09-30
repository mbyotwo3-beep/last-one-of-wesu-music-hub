-- ============================================================================
-- Song credits: a featured artist needs an account, a plain collaborator does
-- not.
--
-- The rule the business wants:
--   * "featured"  → the other person must have a Wesu account. A feature is a
--                   platform-level credit with its own artist page, follower
--                   count and payout, so it needs a real identity behind it.
--   * producer / writer / remixer → a name is enough. Plenty of good work is
--                   made with people who will never sign up, and forcing an
--                   account meant the credit could not be recorded at all.
--
-- Today `song_collaborators.artist_id` is NOT NULL, so a name-only credit was
-- literally impossible, and `listSongCollaborators` was dead code — credits
-- existed in the database but were never rendered anywhere.
--
-- Revenue safety: the payout trigger inner-joins `artists` on `artist_id`, so
-- a credit-only row (artist_id NULL, split_pct 0) is excluded from revenue
-- splits automatically. No money moves for a name-only credit.
-- ============================================================================

-- 1) Allow a credit with no artist, carrying a name instead.
ALTER TABLE public.song_collaborators
  ALTER COLUMN artist_id DROP NOT NULL;

ALTER TABLE public.song_collaborators
  ADD COLUMN IF NOT EXISTS credit_name text;

-- Trim/validate names rather than storing blanks or megabytes of text.
ALTER TABLE public.song_collaborators
  DROP CONSTRAINT IF EXISTS song_collaborators_credit_name_check;
ALTER TABLE public.song_collaborators
  ADD CONSTRAINT song_collaborators_credit_name_check
  CHECK (credit_name IS NULL OR (char_length(btrim(credit_name)) BETWEEN 1 AND 80));

-- Exactly one identity: an account (artist_id) or a name (credit_name).
ALTER TABLE public.song_collaborators
  DROP CONSTRAINT IF EXISTS song_collaborators_identity_check;
ALTER TABLE public.song_collaborators
  ADD CONSTRAINT song_collaborators_identity_check
  CHECK ((artist_id IS NOT NULL AND credit_name IS NULL)
      OR (artist_id IS NULL AND credit_name IS NOT NULL));

-- A FEATURED credit must be a real account — that is the whole point of the
-- rule. Name-only credits are limited to the non-feature roles.
ALTER TABLE public.song_collaborators
  DROP CONSTRAINT IF EXISTS song_collaborators_feature_needs_account;
ALTER TABLE public.song_collaborators
  ADD CONSTRAINT song_collaborators_feature_needs_account
  CHECK (role <> 'featured' OR artist_id IS NOT NULL);

-- A name-only credit can never take a share of the money.
ALTER TABLE public.song_collaborators
  DROP CONSTRAINT IF EXISTS song_collaborators_credit_only_no_split;
ALTER TABLE public.song_collaborators
  ADD CONSTRAINT song_collaborators_credit_only_no_split
  CHECK (artist_id IS NOT NULL OR split_pct = 0);

-- 2) Uniqueness must ignore name-only rows, which have no artist to key on,
--    and must stop one artist being credited twice on the same song.
ALTER TABLE public.song_collaborators
  DROP CONSTRAINT IF EXISTS song_collaborators_song_id_artist_id_key;

CREATE UNIQUE INDEX IF NOT EXISTS song_collaborators_song_artist_uniq
  ON public.song_collaborators (song_id, artist_id)
  WHERE artist_id IS NOT NULL;

-- No duplicate credit names on one song (case/whitespace insensitive).
CREATE UNIQUE INDEX IF NOT EXISTS song_collaborators_song_credit_name_uniq
  ON public.song_collaborators (song_id, lower(btrim(credit_name)))
  WHERE credit_name IS NOT NULL;

-- 3) Expose credit_name publicly. split_pct stays hidden — this view is the
--    only thing anon can read, and it must never carry financial terms.
DROP VIEW IF EXISTS public.public_song_collaborators;
CREATE VIEW public.public_song_collaborators WITH (security_invoker = true) AS
SELECT id, song_id, artist_id, credit_name, role, accepted, created_at
FROM public.song_collaborators
WHERE accepted = true;
GRANT SELECT ON public.public_song_collaborators TO anon, authenticated;
