UPDATE public.songs s
SET status = 'approved'
FROM public.artists a
WHERE s.artist_id = a.id
  AND s.status = 'pending'
  AND a.status = 'approved'
  AND a.verified = true;