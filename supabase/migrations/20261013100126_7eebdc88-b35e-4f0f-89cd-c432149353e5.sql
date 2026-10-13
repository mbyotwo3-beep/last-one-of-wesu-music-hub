INSERT INTO public.user_roles (user_id, role)
SELECT a.user_id, 'artist'::app_role FROM public.artists a
WHERE a.verification_status = 'approved' AND a.user_id IS NOT NULL
ON CONFLICT (user_id, role) DO NOTHING;