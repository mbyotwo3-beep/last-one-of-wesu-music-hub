-- ============================================================================
-- Collaboration invite notifications: search, add, approve.
--
-- The flow is "search a registered artist, add them, they approve in their
-- Collabs inbox" — but nothing ever TOLD the invited artist an invite
-- existed. Unless they happened to open /collabs, the invite sat unseen and
-- the credit never appeared. These triggers close that loop:
--
--   * new invite (accepted = false, real artist) → notify the invited artist
--   * invite accepted (false → true)             → notify the inviter
--
-- Name-only credits (credit_name, no artist) notify nobody: there is no
-- account to notify, and they are live immediately anyway.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.notify_collab_invite()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_invitee uuid;
  v_song_title text;
BEGIN
  -- Only account-backed invites. Name-only credits have no artist to tell.
  IF NEW.artist_id IS NULL THEN
    RETURN NEW;
  END IF;
  -- Only fresh invites, not accepted rows or backfills.
  IF NEW.accepted IS DISTINCT FROM false THEN
    RETURN NEW;
  END IF;

  SELECT user_id INTO v_invitee FROM public.artists WHERE id = NEW.artist_id;
  IF v_invitee IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT title INTO v_song_title FROM public.songs WHERE id = NEW.song_id;

  INSERT INTO public.notifications (user_id, type, title, body, link)
  VALUES (
    v_invitee,
    'collab_invite',
    'You were added to a song',
    COALESCE(v_song_title, 'A song') || ' • ' || COALESCE(NEW.role, 'featured'),
    '/collabs'
  );
  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION public.notify_collab_invite() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_notify_collab_invite ON public.song_collaborators;
CREATE TRIGGER trg_notify_collab_invite
  AFTER INSERT ON public.song_collaborators
  FOR EACH ROW EXECUTE FUNCTION public.notify_collab_invite();

CREATE OR REPLACE FUNCTION public.notify_collab_accepted()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_song_title text;
BEGIN
  -- Fire only on the false → true transition, and only when someone invited
  -- them (invited_by is the auth user who created the invite).
  IF OLD.accepted IS DISTINCT FROM false OR NEW.accepted IS DISTINCT FROM true THEN
    RETURN NEW;
  END IF;
  IF NEW.invited_by IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT title INTO v_song_title FROM public.songs WHERE id = NEW.song_id;

  INSERT INTO public.notifications (user_id, type, title, body, link)
  VALUES (
    NEW.invited_by,
    'collab_accepted',
    'Collaboration accepted',
    COALESCE(v_song_title, 'Your song') || ' • the credit is now live',
    '/collabs'
  );
  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION public.notify_collab_accepted() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_notify_collab_accepted ON public.song_collaborators;
CREATE TRIGGER trg_notify_collab_accepted
  AFTER UPDATE OF accepted ON public.song_collaborators
  FOR EACH ROW EXECUTE FUNCTION public.notify_collab_accepted();
