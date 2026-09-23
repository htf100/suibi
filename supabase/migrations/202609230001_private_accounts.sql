-- Run after creating a Supabase project. The site publishes no essay text to GitHub Pages.
create table if not exists public.members (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  display_name text not null default '',
  role text not null default 'writer' check (role in ('owner', 'writer')),
  active boolean not null default true,
  invited_at timestamptz not null default now()
);

create table if not exists public.essays (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  title text not null default '' check (char_length(title) <= 100),
  body text not null default '',
  written_date date not null default current_date,
  written_time text not null default '' check (written_time = '' or written_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  place_name text not null default '' check (char_length(place_name) <= 100),
  summary text not null default '' check (char_length(summary) <= 180),
  tags text[] not null default '{}',
  status text not null default 'draft' check (status in ('draft', 'published')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint published_has_content check (status = 'draft' or (btrim(title) <> '' and btrim(body) <> ''))
);

create index if not exists essays_owner_timeline_idx on public.essays (owner_id, status, written_date desc, written_time desc);

create or replace function public.touch_essay_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
drop trigger if exists essays_touch_updated_at on public.essays;
create trigger essays_touch_updated_at before update on public.essays
for each row execute function public.touch_essay_updated_at();

alter table public.members enable row level security;
alter table public.essays enable row level security;
revoke all on public.members from anon, authenticated;
revoke all on public.essays from anon, authenticated;
grant select on public.members to authenticated;
grant select, insert, update, delete on public.essays to authenticated;

create policy "Members can read their own membership" on public.members
for select to authenticated using ((select auth.uid()) = user_id);

create policy "Active authors can read their own essays" on public.essays
for select to authenticated using (
  (select auth.uid()) = owner_id and exists (
    select 1 from public.members m where m.user_id = (select auth.uid()) and m.active
  )
);
create policy "Active authors can create their own essays" on public.essays
for insert to authenticated with check (
  (select auth.uid()) = owner_id and exists (
    select 1 from public.members m where m.user_id = (select auth.uid()) and m.active
  )
);
create policy "Active authors can update their own essays" on public.essays
for update to authenticated using (
  (select auth.uid()) = owner_id and exists (
    select 1 from public.members m where m.user_id = (select auth.uid()) and m.active
  )
) with check (
  (select auth.uid()) = owner_id and exists (
    select 1 from public.members m where m.user_id = (select auth.uid()) and m.active
  )
);
create policy "Active authors can delete their own essays" on public.essays
for delete to authenticated using (
  (select auth.uid()) = owner_id and exists (
    select 1 from public.members m where m.user_id = (select auth.uid()) and m.active
  )
);

-- After inviting the owner in Authentication > Users, insert their Auth user ID:
-- insert into public.members (user_id, email, display_name, role)
-- values ('OWNER_AUTH_USER_UUID', 'owner@example.com', 'tf', 'owner');
