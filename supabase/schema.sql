-- Simple Forever Plan — database, privacy rules and file storage.
-- Run this once in the Supabase SQL editor (or `supabase db push`).
--
-- Who can see what:
--   • The storyteller (vault owner) can read and change everything in their plan.
--   • Invited family can read the plan after signing in with the code sent to their email or phone.
--   • Family see the medical binder (and its photos) only if the storyteller allowed it.
--   • Family never see the invite list, and can't change anything.

create table if not exists public.vaults (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null unique references auth.users (id) on delete cascade,
  storyteller text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.vault_members (
  id uuid primary key default gen_random_uuid(),
  vault_id uuid not null references public.vaults (id) on delete cascade,
  name text not null,
  contact text not null,               -- lower-case email, or phone in +15551234567 form
  channel text not null check (channel in ('email', 'sms')),
  can_view_medical boolean not null default true,
  created_at timestamptz not null default now(),
  unique (vault_id, contact)
);

create table if not exists public.records (
  vault_id uuid not null references public.vaults (id) on delete cascade,
  collection text not null,
  id text not null,
  data jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (vault_id, collection, id)
);

alter table public.vaults enable row level security;
alter table public.vault_members enable row level security;
alter table public.records enable row level security;

-- The signed-in person's email and phone, in the same form invites are stored in.
create or replace function public.my_contacts() returns text[]
language sql stable as $$
  select array_remove(array[
    lower(auth.jwt() ->> 'email'),
    case when coalesce(auth.jwt() ->> 'phone', '') <> '' then '+' || ltrim(auth.jwt() ->> 'phone', '+') end
  ], null)
$$;

create or replace function public.is_owner(v uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from vaults where id = v and owner_id = auth.uid())
$$;

-- null = not a member; otherwise whether they may see medical information.
create or replace function public.member_medical(v uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select bool_or(can_view_medical) from vault_members where vault_id = v and contact = any (public.my_contacts())
$$;

-- Which plan the signed-in person opens: their own first, otherwise one they were invited to.
create or replace function public.my_vault()
returns table (vault_id uuid, role text, display_name text, can_view_medical boolean)
language sql stable security definer set search_path = public as $$
  select id, 'owner', storyteller, true from vaults where owner_id = auth.uid()
  union all
  select m.vault_id, 'family', m.name, m.can_view_medical
  from vault_members m
  where m.contact = any (public.my_contacts())
    and not exists (select 1 from vaults where owner_id = auth.uid())
  limit 1
$$;

create or replace function public.create_vault(storyteller text) returns uuid
language plpgsql security definer set search_path = public as $$
declare v uuid;
begin
  if auth.uid() is null then raise exception 'Please sign in first'; end if;
  insert into vaults (owner_id, storyteller) values (auth.uid(), storyteller)
  on conflict (owner_id) do update set storyteller = excluded.storyteller
  returning id into v;
  return v;
end $$;

create or replace function public.add_member(member_name text, member_contact text, medical boolean) returns uuid
language plpgsql security definer set search_path = public as $$
declare v uuid; m uuid;
begin
  select id into v from vaults where owner_id = auth.uid();
  if v is null then raise exception 'Only the storyteller can invite family'; end if;
  insert into vault_members (vault_id, name, contact, channel, can_view_medical)
  values (v, member_name, lower(member_contact), case when member_contact like '%@%' then 'email' else 'sms' end, medical)
  on conflict (vault_id, contact) do update set name = excluded.name, can_view_medical = excluded.can_view_medical
  returning id into m;
  return m;
end $$;

-- vaults: owners see their own row.
drop policy if exists "owner reads vault" on public.vaults;
create policy "owner reads vault" on public.vaults for select using (owner_id = auth.uid());

-- vault_members: only the owner manages the invite list.
drop policy if exists "owner manages members" on public.vault_members;
create policy "owner manages members" on public.vault_members for all
  using (public.is_owner(vault_id)) with check (public.is_owner(vault_id));

-- records: owner reads and writes; family reads (medical only if allowed; never the member list).
drop policy if exists "owner writes records" on public.records;
create policy "owner writes records" on public.records for all
  using (public.is_owner(vault_id)) with check (public.is_owner(vault_id));

drop policy if exists "family reads records" on public.records;
create policy "family reads records" on public.records for select using (
  collection not in ('members', 'asks', 'insights')
  and public.member_medical(vault_id) is not null
  and (collection <> 'medical' or public.member_medical(vault_id))
);

-- Private file storage: <vault>/<shared|medical>/<file>
insert into storage.buckets (id, name, public) values ('media', 'media', false)
on conflict (id) do nothing;

drop policy if exists "owner manages media" on storage.objects;
create policy "owner manages media" on storage.objects for all
  using (bucket_id = 'media' and public.is_owner(split_part(name, '/', 1)::uuid))
  with check (bucket_id = 'media' and public.is_owner(split_part(name, '/', 1)::uuid));

drop policy if exists "family reads media" on storage.objects;
create policy "family reads media" on storage.objects for select using (
  bucket_id = 'media'
  and public.member_medical(split_part(name, '/', 1)::uuid) is not null
  and (split_part(name, '/', 2) <> 'medical' or public.member_medical(split_part(name, '/', 1)::uuid))
);
