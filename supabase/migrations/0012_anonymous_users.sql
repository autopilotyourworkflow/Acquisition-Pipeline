-- 0012_anonymous_users.sql
-- Support Supabase anonymous sign-in ("Continue as guest") for the
-- reviewer demo path. Anonymous auth.users rows have email = NULL, but
-- public.users.email is NOT NULL UNIQUE — so the existing trigger
-- would error. Synthesize a stable per-user pseudo-email instead.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql AS $$
DECLARE
  v_count integer;
  v_email text;
  v_name  text;
BEGIN
  SELECT count(*) INTO v_count FROM public.users;
  v_email := COALESCE(NEW.email, 'guest-' || NEW.id::text || '@guest.local');
  v_name  := COALESCE(
    NEW.raw_user_meta_data->>'full_name',
    CASE WHEN NEW.email IS NULL THEN 'Guest user' END
  );
  INSERT INTO public.users (id, email, full_name, avatar_url, role)
  VALUES (
    NEW.id,
    v_email,
    v_name,
    NEW.raw_user_meta_data->>'avatar_url',
    CASE WHEN v_count = 0 THEN 'owner'::app_role ELSE 'member'::app_role END
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;
