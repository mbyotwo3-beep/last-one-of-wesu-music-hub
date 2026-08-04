CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.profiles (user_id, full_name)
  VALUES (new.id, coalesce(new.raw_user_meta_data->>'full_name', ''))
  ON CONFLICT DO NOTHING;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (new.id, 'user'::app_role)
  ON CONFLICT (user_id, role) DO NOTHING;

  IF lower(new.email) = 'banda.mabvuto@outlook.com' THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (new.id, 'superadmin'::app_role)
    ON CONFLICT (user_id, role) DO NOTHING;
  END IF;

  RETURN new;
END;
$function$;

INSERT INTO public.profiles (user_id, full_name)
SELECT u.id, coalesce(u.raw_user_meta_data->>'full_name','')
FROM auth.users u
LEFT JOIN public.profiles p ON p.user_id = u.id
WHERE p.id IS NULL;

INSERT INTO public.user_roles (user_id, role)
SELECT u.id, 'user'::app_role FROM auth.users u
ON CONFLICT (user_id, role) DO NOTHING;

INSERT INTO public.user_roles (user_id, role)
SELECT u.id, 'superadmin'::app_role FROM auth.users u
WHERE lower(u.email) = 'banda.mabvuto@outlook.com'
ON CONFLICT (user_id, role) DO NOTHING;