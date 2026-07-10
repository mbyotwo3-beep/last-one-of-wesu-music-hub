-- Restore SECURITY DEFINER on role/ownership helpers.
-- These are used inside RLS policies; SECURITY INVOKER forces the caller to have
-- direct SELECT on user_roles/labels/artists which they don't (and shouldn't),
-- causing "permission denied for function is_staff" and cascading 404/connection
-- errors on artist application, admin pages, and label pages.
ALTER FUNCTION public.has_role(uuid, app_role)         SECURITY DEFINER;
ALTER FUNCTION public.is_staff(uuid)                    SECURITY DEFINER;
ALTER FUNCTION public.is_superadmin(uuid)               SECURITY DEFINER;
ALTER FUNCTION public.is_label_owner(uuid, uuid)        SECURITY DEFINER;
ALTER FUNCTION public.is_song_collaborator(uuid, uuid)  SECURITY DEFINER;
ALTER FUNCTION public.artist_user_id(uuid)              SECURITY DEFINER;

-- Ensure EXECUTE is granted where RLS policies need it. RLS evaluates as the
-- caller's role, so both anon and authenticated must be able to call the helper.
GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role)         TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_staff(uuid)                    TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_superadmin(uuid)               TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_label_owner(uuid, uuid)        TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_song_collaborator(uuid, uuid)  TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.artist_user_id(uuid)              TO anon, authenticated;