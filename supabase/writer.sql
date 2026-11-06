-- Simple Forever Plan — lets the story writer check who is asking, with a daily limit.
-- Paste into Supabase → SQL Editor → New query → Run (after inbox.sql). Safe to run more than once.
--
-- The storyteller's phone proves it's them with its private mailbox key. Each mailbox can ask the
-- writer a limited number of times per day, so nobody else can run up your Anthropic bill.

create table if not exists public.writer_usage (
  inbox_id uuid not null references public.inboxes (id) on delete cascade,
  day date not null default current_date,
  calls integer not null default 0,
  primary key (inbox_id, day)
);
alter table public.writer_usage enable row level security;

create or replace function public.use_writer(inbox uuid, secret text) returns boolean
language plpgsql security definer set search_path = public, extensions as $$
declare n integer;
begin
  if not exists (select 1 from inboxes i where i.id = inbox and i.key_hash = crypt(secret, i.key_hash)) then
    raise exception 'Not allowed';
  end if;
  insert into writer_usage (inbox_id, day, calls) values (inbox, current_date, 1)
  on conflict (inbox_id, day) do update set calls = writer_usage.calls + 1
  returning calls into n;
  if n > 60 then raise exception 'Daily writing limit reached — try again tomorrow.'; end if;
  return true;
end $$;

revoke all on function public.use_writer(uuid, text) from public;
grant execute on function public.use_writer(uuid, text) to anon, authenticated;
