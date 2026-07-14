
-- 1) Remove anonymous access to split_pct on song_collaborators.
-- The public_song_collaborators view (non-financial columns only) already exists for public reads.
DROP POLICY IF EXISTS "collabs public read accepted" ON public.song_collaborators;

-- 2) Revoke EXECUTE on sensitive SECURITY DEFINER functions from anon/authenticated.
-- Keep RLS-predicate helpers executable (they must run under the querying role in policies).
REVOKE EXECUTE ON FUNCTION public.get_artist_available_balance(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_label_available_balance(uuid) FROM PUBLIC, anon, authenticated;
