
-- 1) saved_tracks table
CREATE TABLE IF NOT EXISTS public.saved_tracks (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  song_id UUID NOT NULL REFERENCES public.songs(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, song_id)
);
CREATE INDEX IF NOT EXISTS saved_tracks_user_idx ON public.saved_tracks(user_id, created_at DESC);

GRANT SELECT, INSERT, DELETE ON public.saved_tracks TO authenticated;
GRANT ALL ON public.saved_tracks TO service_role;

ALTER TABLE public.saved_tracks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage their own saved tracks"
  ON public.saved_tracks
  FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- 2) Seed payment_methods (idempotent)
INSERT INTO public.payment_methods (code, label, category, lenco_operator, is_enabled, sort_order)
VALUES
  ('mtn_zm',     'MTN Mobile Money',    'mobile_money', 'mtn-zambia',    true, 1),
  ('airtel_zm',  'Airtel Money',        'mobile_money', 'airtel-zambia', true, 2),
  ('zamtel_zm',  'Zamtel Kwacha',       'mobile_money', 'zamtel-zambia', true, 3),
  ('card',       'Debit / Credit Card', 'card',         NULL,            true, 4)
ON CONFLICT (code) DO UPDATE
  SET label = EXCLUDED.label,
      category = EXCLUDED.category,
      lenco_operator = EXCLUDED.lenco_operator,
      is_enabled = EXCLUDED.is_enabled,
      sort_order = EXCLUDED.sort_order;
