-- Per-slide link target for the hero carousel, set by admin/superadmin:
-- '_self' opens in the same tab, '_blank' opens a new tab on web and the
-- in-app browser overlay on native (Facebook-Lite style, never kicks the
-- user out to the system browser).
alter table public.hero_carousel_slides
  add column if not exists link_target text not null default '_self';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'hero_slides_link_target_check'
  ) then
    alter table public.hero_carousel_slides
      add constraint hero_slides_link_target_check
      check (link_target in ('_self', '_blank'));
  end if;
end
$$;
