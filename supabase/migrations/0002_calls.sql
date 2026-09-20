-- FRX Messenger — voice/video calls. Run once in the Supabase SQL editor, after 0001.
--
-- Call state (ringing/accepted/declined/…) lives in `calls`, so the caller identity is authenticated
-- by the database. WebRTC offers/answers/ICE travel over a private Realtime channel `call:<id>` that
-- only the two participants may join. Call results are written into the chat as `call` messages.

create table public.calls (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  caller_id       uuid not null references public.profiles(id) on delete cascade,
  callee_id       uuid not null references public.profiles(id) on delete cascade,
  video           boolean not null default false,
  status          text not null default 'ringing'
                  check (status in ('ringing', 'accepted', 'declined', 'cancelled', 'missed', 'ended')),
  created_at      timestamptz not null default now(),
  answered_at     timestamptz,
  ended_at        timestamptz,
  check (caller_id <> callee_id)
);
create index calls_callee_idx on public.calls (callee_id, created_at desc);
create index calls_caller_idx on public.calls (caller_id, created_at desc);

alter table public.calls enable row level security;
create policy "parties read calls" on public.calls for select to authenticated
  using (auth.uid() in (caller_id, callee_id));
revoke all on public.calls from anon, authenticated;
grant select on public.calls to authenticated;          -- writes only through the RPCs below

-- Chat messages may now be of type 'call'.
alter table public.messages drop constraint messages_message_type_check;
alter table public.messages add constraint messages_message_type_check
  check (message_type in ('text', 'image', 'file', 'call'));

create or replace function public.start_call(_conversation uuid, _video boolean)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  _me uuid := auth.uid();
  _callee uuid;
  _id uuid;
begin
  if _me is null then raise exception 'not authenticated'; end if;
  if not exists (select 1 from conversations where id = _conversation and type = 'direct') then
    raise exception 'calls are only available in direct chats';
  end if;
  if not exists (select 1 from conversation_members where conversation_id = _conversation and user_id = _me) then
    raise exception 'not a member';
  end if;
  select user_id into _callee from conversation_members
    where conversation_id = _conversation and user_id <> _me limit 1;
  if _callee is null then raise exception 'no one to call'; end if;
  insert into calls (conversation_id, caller_id, callee_id, video)
  values (_conversation, _me, _callee, coalesce(_video, false)) returning id into _id;
  return _id;
end $$;

create or replace function public.set_call_status(_id uuid, _status text)
returns void language plpgsql security definer set search_path = public as $$
declare
  c public.calls;
  _me uuid := auth.uid();
begin
  select * into c from calls where id = _id for update;
  if not found or _me is null or _me not in (c.caller_id, c.callee_id) then
    raise exception 'call not found';
  end if;
  if c.status in ('declined', 'cancelled', 'missed', 'ended') then return; end if;

  if _status = 'accepted' and _me = c.callee_id and c.status = 'ringing'
     and c.created_at > now() - interval '2 minutes' then
    update calls set status = 'accepted', answered_at = now() where id = _id;
  elsif _status = 'declined' and _me = c.callee_id and c.status = 'ringing' then
    update calls set status = 'declined', ended_at = now() where id = _id;
  elsif _status in ('cancelled', 'missed') and _me = c.caller_id and c.status = 'ringing' then
    update calls set status = _status, ended_at = now() where id = _id;
  elsif _status = 'ended' and c.status = 'accepted' then
    update calls set status = 'ended', ended_at = now() where id = _id;
  end if;
end $$;

-- When a call finishes, record it in the chat as "<video|voice>|<outcome>|<seconds>", sent by the caller.
create or replace function public.calls_after_update()
returns trigger language plpgsql security definer set search_path = public as $$
declare _secs integer;
begin
  if new.status in ('declined', 'cancelled', 'missed', 'ended') and old.status in ('ringing', 'accepted') then
    _secs := case when new.answered_at is not null
                  then greatest(0, extract(epoch from (new.ended_at - new.answered_at))::integer) else 0 end;
    insert into messages (conversation_id, sender_id, content, message_type)
    values (new.conversation_id, new.caller_id,
            (case when new.video then 'video' else 'voice' end) || '|' || new.status || '|' || _secs, 'call');
  end if;
  return new;
end $$;
create trigger calls_au after update on public.calls
  for each row execute function public.calls_after_update();

grant execute on function public.start_call(uuid, boolean), public.set_call_status(uuid, text) to authenticated;
revoke execute on function public.start_call(uuid, boolean), public.set_call_status(uuid, text) from anon, public;

-- Call log entries shouldn't show up in message search.
create or replace function public.search_messages(_query text)
returns table (id uuid, conversation_id uuid, sender_id uuid, sender_name text, content text, created_at timestamptz)
language sql stable security invoker set search_path = public as $$
  select m.id, m.conversation_id, m.sender_id, p.full_name, m.content, m.created_at
  from messages m join profiles p on p.id = m.sender_id
  where m.deleted_at is null and m.message_type <> 'call' and char_length(btrim(_query)) >= 2
    and m.content ilike '%' || replace(replace(replace(btrim(_query), '\', '\\'), '%', '\%'), '_', '\_') || '%'
  order by m.created_at desc
  limit 30;
$$;

-- Realtime: call state changes, and the private signalling channel `call:<id>` (participants only).
alter publication supabase_realtime add table public.calls;

create or replace function public.can_use_topic(_topic text)
returns boolean language sql stable security definer set search_path = public as $$
  select case
    when _topic = 'lobby' then auth.uid() is not null
    when _topic ~ '^conv:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then public.is_member(substr(_topic, 6)::uuid)
    when _topic ~ '^call:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then exists (select 1 from public.calls
                   where id = substr(_topic, 6)::uuid and auth.uid() in (caller_id, callee_id)
                     and status in ('ringing', 'accepted'))
    else false
  end;
$$;
