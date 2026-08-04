CREATE TABLE public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type text NOT NULL DEFAULT 'general',
  title text NOT NULL,
  body text,
  link text,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX notifications_user_created_idx ON public.notifications(user_id, created_at DESC);

GRANT SELECT, UPDATE ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own notifications" ON public.notifications
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users mark own notifications read" ON public.notifications
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ===== song moderation notification =====
CREATE OR REPLACE FUNCTION public.notify_song_moderation()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_user uuid;
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status AND NEW.status IN ('approved','rejected') THEN
    SELECT user_id INTO v_user FROM public.artists WHERE id = NEW.artist_id;
    IF v_user IS NOT NULL THEN
      INSERT INTO public.notifications (user_id, type, title, body, link)
      VALUES (v_user, 'song_moderation',
        CASE WHEN NEW.status='approved' THEN 'Your song was approved' ELSE 'Your song was rejected' END,
        NEW.title, '/artist-studio');
    END IF;
  END IF;
  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION public.notify_song_moderation() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_notify_song_moderation ON public.songs;
CREATE TRIGGER trg_notify_song_moderation AFTER UPDATE OF status ON public.songs
  FOR EACH ROW EXECUTE FUNCTION public.notify_song_moderation();

-- ===== artist moderation notification =====
CREATE OR REPLACE FUNCTION public.notify_artist_moderation()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status AND NEW.status IN ('approved','rejected') AND NEW.user_id IS NOT NULL THEN
    INSERT INTO public.notifications (user_id, type, title, body, link)
    VALUES (NEW.user_id, 'artist_moderation',
      CASE WHEN NEW.status='approved' THEN 'Your artist application was approved' ELSE 'Your artist application was rejected' END,
      NEW.name, '/artist-dashboard');
  END IF;
  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION public.notify_artist_moderation() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_notify_artist_moderation ON public.artists;
CREATE TRIGGER trg_notify_artist_moderation AFTER UPDATE OF status ON public.artists
  FOR EACH ROW EXECUTE FUNCTION public.notify_artist_moderation();

-- ===== payout decision notification =====
CREATE OR REPLACE FUNCTION public.notify_payout_decision()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_user uuid;
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status AND NEW.status IN ('approved','rejected','paid','completed') THEN
    IF NEW.artist_id IS NOT NULL THEN
      SELECT user_id INTO v_user FROM public.artists WHERE id = NEW.artist_id;
    ELSIF NEW.label_id IS NOT NULL THEN
      SELECT owner_user_id INTO v_user FROM public.labels WHERE id = NEW.label_id;
    END IF;
    IF v_user IS NOT NULL THEN
      INSERT INTO public.notifications (user_id, type, title, body, link)
      VALUES (v_user, 'payout', 'Payout ' || NEW.status,
        'ZMW ' || NEW.amount::text, '/artist-dashboard');
    END IF;
  END IF;
  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION public.notify_payout_decision() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_notify_payout_decision ON public.payouts;
CREATE TRIGGER trg_notify_payout_decision AFTER UPDATE OF status ON public.payouts
  FOR EACH ROW EXECUTE FUNCTION public.notify_payout_decision();