ALTER FUNCTION public.has_role(uuid, app_role)         SECURITY INVOKER;
ALTER FUNCTION public.is_staff(uuid)                    SECURITY INVOKER;
ALTER FUNCTION public.is_superadmin(uuid)               SECURITY INVOKER;
ALTER FUNCTION public.is_label_owner(uuid, uuid)        SECURITY INVOKER;
ALTER FUNCTION public.is_song_collaborator(uuid, uuid)  SECURITY INVOKER;
ALTER FUNCTION public.artist_user_id(uuid)              SECURITY INVOKER;
ALTER FUNCTION public.increment_play_count(uuid)        SECURITY INVOKER;