-- Support inbox owned by superadmin/admin users (no external mailbox).
-- Visitors submit from /contact; staff read + resolve from the admin panel.
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
  using (public.is_staff(auth.uid()));

drop policy if exists "Staff can resolve support messages" on public.support_messages;
create policy "Staff can resolve support messages"
  on public.support_messages for update
  to authenticated
  using (public.is_staff(auth.uid()))
  with check (public.is_staff(auth.uid()));
