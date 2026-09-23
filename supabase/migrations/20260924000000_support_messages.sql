-- Support inbox owned by superadmin/admin users (no external mailbox).
-- Visitors submit from /contact; staff read + resolve from the admin panel.
--
-- NOTE: the staff check uses private.is_staff (the canonical helper — the
-- public.is_staff copy was dropped by earlier migrations). It is
-- re-declared here with CREATE OR REPLACE so this file runs cleanly
-- regardless of which historical migrations have been applied.
create schema if not exists private;
grant usage on schema private to anon, authenticated, service_role;

create or replace function private.is_staff(_user_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles where user_id = _user_id and role in ('admin','superadmin'))
$$;

grant execute on function private.is_staff(uuid) to anon, authenticated, service_role;

create table if not exists public.support_messages (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null,
  user_id uuid null references auth.users(id) on delete set null,
  subject text null,
  message text not null,
  status text not null default 'open',
  created_at timestamptz not null default now(),
  resolved_at timestamptz null,
  resolved_by uuid null
);

alter table public.support_messages enable row level security;

drop policy if exists "Anyone can submit support messages" on public.support_messages;
create policy "Anyone can submit support messages"
  on public.support_messages for insert
  to anon, authenticated
  with check (char_length(message) > 0 and char_length(message) <= 5000);

drop policy if exists "Staff can read support messages" on public.support_messages;
create policy "Staff can read support messages"
  on public.support_messages for select
  to authenticated
  using (private.is_staff(auth.uid()));

drop policy if exists "Staff can resolve support messages" on public.support_messages;
create policy "Staff can resolve support messages"
  on public.support_messages for update
  to authenticated
  using (private.is_staff(auth.uid()))
  with check (private.is_staff(auth.uid()));
