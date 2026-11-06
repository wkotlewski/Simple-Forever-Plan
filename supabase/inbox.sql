-- Simple Forever Plan — answer mailbox for "Ask someone who knows".
-- Paste this whole file into Supabase → SQL Editor → New query, then tap Run. Safe to run more than once.
--
-- How it works:
--   • The storyteller's app creates a private mailbox and keeps its secret key on their phone.
--   • A relative who gets a question link can drop an answer (text + optional voice recording) into
--     that mailbox, but can't read anything in it.
--   • Only the storyteller's app, holding the key, can read answers. Once added to the story, they
--     are deleted from the mailbox.
-- Nobody can read the tables directly; everything goes through the four functions below.

create extension if not exists pgcrypto;

create table if not exists public.inboxes (
  id uuid primary key default gen_random_uuid(),
  key_hash text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.inbox_answers (
  id uuid primary key default gen_random_uuid(),
  inbox_id uuid not null references public.inboxes (id) on delete cascade,
  ask_id text not null,
  question text not null,
  from_name text not null,
  answer text not null default '',
  audio_type text,
  audio_base64 text,           -- voice recording, if they sent one
  created_at timestamptz not null default now()
);
create index if not exists inbox_answers_inbox on public.inbox_answers (inbox_id, created_at);

alter table public.inboxes enable row level security;
alter table public.inbox_answers enable row level security;
-- No policies on purpose: the tables are closed to direct access.

-- Storyteller: create a mailbox (the key never leaves their phone; only its hash is stored).
create or replace function public.create_inbox(secret text) returns uuid
language plpgsql security definer set search_path = public, extensions as $$
declare v uuid;
begin
  if length(secret) < 24 then raise exception 'key too short'; end if;
  insert into inboxes (key_hash) values (crypt(secret, gen_salt('bf'))) returning id into v;
  return v;
end $$;

-- Relative: drop an answer into a mailbox.
create or replace function public.send_answer(
  inbox uuid, ask text, q text, sender text, body text, audio_type text default null, audio text default null
) returns boolean
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from inboxes where id = inbox) then raise exception 'This question link is no longer active.'; end if;
  if length(coalesce(body, '')) > 20000 then raise exception 'Answer is too long.'; end if;
  if length(coalesce(audio, '')) > 14000000 then raise exception 'Recording is too long — please keep it under about 10 minutes.'; end if;
  if (select count(*) from inbox_answers where inbox_id = inbox) >= 200 then raise exception 'This mailbox is full.'; end if;
  insert into inbox_answers (inbox_id, ask_id, question, from_name, answer, audio_type, audio_base64)
  values (inbox, left(ask, 64), left(q, 1000), left(sender, 120), coalesce(body, ''), left(audio_type, 80), audio);
  return true;
end $$;

-- Storyteller: read waiting answers (needs the key).
create or replace function public.read_inbox(inbox uuid, secret text)
returns table (id uuid, ask_id text, question text, from_name text, answer text, audio_type text, audio_base64 text, created_at timestamptz)
language plpgsql security definer set search_path = public, extensions as $$
begin
  if not exists (select 1 from inboxes i where i.id = inbox and i.key_hash = crypt(secret, i.key_hash)) then
    raise exception 'Not allowed';
  end if;
  return query select a.id, a.ask_id, a.question, a.from_name, a.answer, a.audio_type, a.audio_base64, a.created_at
    from inbox_answers a where a.inbox_id = inbox order by a.created_at;
end $$;

-- Storyteller: remove answers once they are saved in the story.
create or replace function public.clear_answers(inbox uuid, secret text, ids uuid[]) returns integer
language plpgsql security definer set search_path = public, extensions as $$
declare n integer;
begin
  if not exists (select 1 from inboxes i where i.id = inbox and i.key_hash = crypt(secret, i.key_hash)) then
    raise exception 'Not allowed';
  end if;
  delete from inbox_answers where inbox_id = inbox and id = any (ids);
  get diagnostics n = row_count;
  return n;
end $$;

revoke all on function public.create_inbox(text), public.send_answer(uuid, text, text, text, text, text, text),
  public.read_inbox(uuid, text), public.clear_answers(uuid, text, uuid[]) from public;
grant execute on function public.create_inbox(text), public.send_answer(uuid, text, text, text, text, text, text),
  public.read_inbox(uuid, text), public.clear_answers(uuid, text, uuid[]) to anon, authenticated;
