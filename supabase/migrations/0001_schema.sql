-- FRX Messenger — database schema, RLS, storage, realtime.
-- Run this whole file once in the Supabase SQL editor (or via `supabase db push`).

create extension if not exists pg_trgm;

-- ───────────────────────── Tables ─────────────────────────

create table public.profiles (
  id             uuid primary key references auth.users(id) on delete cascade,
  full_name      text not null check (char_length(full_name) between 1 and 60),
  username       text not null check (username ~ '^[a-z0-9_]{3,20}$'),
  avatar_url     text,
  about          text not null default 'Hey there! I''m using FRX Messenger.' check (char_length(about) <= 200),
  show_online    boolean not null default true,
  show_last_seen boolean not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  last_seen      timestamptz not null default now()
);
create unique index profiles_username_key on public.profiles (lower(username));
create index profiles_full_name_trgm on public.profiles using gin (full_name gin_trgm_ops);
create index profiles_username_trgm on public.profiles using gin (username gin_trgm_ops);

create table public.conversations (
  id              uuid primary key default gen_random_uuid(),
  type            text not null check (type in ('direct', 'group')),
  name            text check (name is null or char_length(name) between 1 and 80),
  avatar_url      text,
  description     text check (description is null or char_length(description) <= 300),
  created_by      uuid references public.profiles(id) on delete set null,
  direct_key      text unique,               -- "<smaller uid>:<larger uid>" so a pair has exactly one chat
  last_message_at timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  check ((type = 'direct') = (direct_key is not null))
);
create index conversations_last_message_idx on public.conversations (last_message_at desc nulls last);

create table public.conversation_members (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  user_id         uuid not null references public.profiles(id) on delete cascade,
  role            text not null default 'member' check (role in ('admin', 'member')),
  joined_at       timestamptz not null default now(),
  unique (conversation_id, user_id)
);
create index conversation_members_user_idx on public.conversation_members (user_id);

create table public.messages (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  sender_id       uuid not null references public.profiles(id) on delete cascade,
  content         text not null default '' check (char_length(content) <= 4000),
  message_type    text not null default 'text' check (message_type in ('text', 'image', 'file')),
  reply_to        uuid references public.messages(id) on delete set null,
  edited_at       timestamptz,
  deleted_at      timestamptz,
  created_at      timestamptz not null default now()
);
create index messages_conv_created_idx on public.messages (conversation_id, created_at desc);
create index messages_content_trgm on public.messages using gin (content gin_trgm_ops);
create index messages_reply_to_idx on public.messages (reply_to);

create table public.message_reactions (
  id              uuid primary key default gen_random_uuid(),
  message_id      uuid not null references public.messages(id) on delete cascade,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  user_id         uuid not null references public.profiles(id) on delete cascade,
  reaction        text not null check (reaction in ('👍', '❤️', '😂', '😮', '😢', '🔥')),
  created_at      timestamptz not null default now(),
  unique (message_id, user_id, reaction)
);
create index message_reactions_conv_idx on public.message_reactions (conversation_id);

create table public.message_reads (
  message_id      uuid not null references public.messages(id) on delete cascade,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  user_id         uuid not null references public.profiles(id) on delete cascade,
  read_at         timestamptz not null default now(),
  primary key (message_id, user_id)
);
create index message_reads_conv_idx on public.message_reads (conversation_id);
create index message_reads_user_idx on public.message_reads (user_id, conversation_id);

create table public.attachments (
  id              uuid primary key default gen_random_uuid(),
  message_id      uuid not null references public.messages(id) on delete cascade,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  storage_path    text not null,
  file_name       text not null check (char_length(file_name) <= 255),
  file_type       text not null,
  file_size       bigint not null check (file_size >= 0 and file_size <= 26214400),
  created_at      timestamptz not null default now()
);
create index attachments_message_idx on public.attachments (message_id);
create index attachments_conv_idx on public.attachments (conversation_id);

-- ───────────────────────── Helpers ─────────────────────────

create or replace function public.is_member(_conv uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from conversation_members where conversation_id = _conv and user_id = auth.uid());
$$;

create or replace function public.is_admin(_conv uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from conversation_members
                 where conversation_id = _conv and user_id = auth.uid() and role = 'admin');
$$;

create or replace function public.is_group(_conv uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from conversations where id = _conv and type = 'group');
$$;

create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

create trigger profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_at();
create trigger conversations_touch before update on public.conversations
  for each row execute function public.touch_updated_at();

-- ───────────────────────── Profile creation on signup ─────────────────────────

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  _username text := lower(coalesce(new.raw_user_meta_data ->> 'username', ''));
  _name     text := btrim(coalesce(new.raw_user_meta_data ->> 'full_name', ''));
begin
  if _username !~ '^[a-z0-9_]{3,20}$' then raise exception 'invalid_username'; end if;
  if char_length(_name) = 0 then raise exception 'invalid_name'; end if;
  insert into public.profiles (id, full_name, username) values (new.id, left(_name, 60), _username);
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Callable before signup (anon) to give friendly "username taken" feedback.
create or replace function public.username_available(_username text)
returns boolean language sql stable security definer set search_path = public as $$
  select not exists (select 1 from profiles where lower(username) = lower(_username));
$$;
grant execute on function public.username_available(text) to anon, authenticated;

-- ───────────────────────── Message triggers ─────────────────────────

create or replace function public.messages_before_insert()
returns trigger language plpgsql as $$
begin
  if new.reply_to is not null and not exists (
    select 1 from public.messages where id = new.reply_to and conversation_id = new.conversation_id
  ) then
    raise exception 'reply target is not in this conversation';
  end if;
  return new;
end $$;
create trigger messages_bi before insert on public.messages
  for each row execute function public.messages_before_insert();

create or replace function public.messages_after_insert()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update conversations set last_message_at = new.created_at where id = new.conversation_id;
  return new;
end $$;
create trigger messages_ai after insert on public.messages
  for each row execute function public.messages_after_insert();

-- Only content / edited_at / deleted_at may change, and only by the sender.
create or replace function public.messages_before_update()
returns trigger language plpgsql as $$
begin
  if new.id <> old.id or new.conversation_id <> old.conversation_id or new.sender_id <> old.sender_id
     or new.message_type <> old.message_type or new.created_at <> old.created_at
     or new.reply_to is distinct from old.reply_to then
    raise exception 'immutable message fields cannot be changed';
  end if;
  if old.deleted_at is not null then raise exception 'message is deleted'; end if;
  if new.deleted_at is not null then
    new.content = '';                                  -- soft delete: keep the row, drop the text
  elsif new.content is distinct from old.content then
    if old.message_type <> 'text' and btrim(new.content) = '' then raise exception 'empty content'; end if;
    new.edited_at = now();
  end if;
  return new;
end $$;
create trigger messages_bu before update on public.messages
  for each row execute function public.messages_before_update();

-- Denormalise conversation_id onto child rows (needed for realtime filters and cheap RLS).
create or replace function public.child_set_conversation()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  select conversation_id into new.conversation_id from messages where id = new.message_id;
  if new.conversation_id is null then raise exception 'message not found'; end if;
  return new;
end $$;
create trigger reactions_conv before insert on public.message_reactions
  for each row execute function public.child_set_conversation();
create trigger reads_conv before insert on public.message_reads
  for each row execute function public.child_set_conversation();
create trigger attachments_conv before insert on public.attachments
  for each row execute function public.child_set_conversation();

-- If the last admin leaves a group, promote the longest-standing member.
create or replace function public.members_after_delete()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from conversations where id = old.conversation_id and type = 'group')
     and not exists (select 1 from conversation_members where conversation_id = old.conversation_id and role = 'admin') then
    update conversation_members set role = 'admin'
    where id = (select id from conversation_members where conversation_id = old.conversation_id
                order by joined_at limit 1);
  end if;
  return old;
end $$;
create trigger members_ad after delete on public.conversation_members
  for each row execute function public.members_after_delete();

-- Group type / creator are fixed.
create or replace function public.conversations_before_update()
returns trigger language plpgsql as $$
begin
  if new.type <> old.type or new.created_by is distinct from old.created_by
     or new.direct_key is distinct from old.direct_key then
    raise exception 'immutable conversation fields cannot be changed';
  end if;
  return new;
end $$;
create trigger conversations_bu before update on public.conversations
  for each row execute function public.conversations_before_update();

-- ───────────────────────── RPCs ─────────────────────────

create or replace function public.create_direct_conversation(_other uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  _me uuid := auth.uid();
  _key text;
  _id uuid;
begin
  if _me is null then raise exception 'not authenticated'; end if;
  if _other is null or _other = _me then raise exception 'invalid user'; end if;
  if not exists (select 1 from profiles where id = _other) then raise exception 'user not found'; end if;
  _key := least(_me::text, _other::text) || ':' || greatest(_me::text, _other::text);
  select id into _id from conversations where direct_key = _key;
  if _id is null then
    insert into conversations (type, direct_key, created_by) values ('direct', _key, _me) returning id into _id;
    insert into conversation_members (conversation_id, user_id, role) values (_id, _me, 'member'), (_id, _other, 'member');
  end if;
  return _id;
end $$;

create or replace function public.create_group(_name text, _description text, _avatar_url text, _members uuid[])
returns uuid language plpgsql security definer set search_path = public as $$
declare
  _me uuid := auth.uid();
  _id uuid;
begin
  if _me is null then raise exception 'not authenticated'; end if;
  if _name is null or char_length(btrim(_name)) = 0 then raise exception 'group name required'; end if;
  insert into conversations (type, name, description, avatar_url, created_by)
  values ('group', btrim(_name), nullif(btrim(coalesce(_description, '')), ''), _avatar_url, _me)
  returning id into _id;
  insert into conversation_members (conversation_id, user_id, role) values (_id, _me, 'admin');
  insert into conversation_members (conversation_id, user_id, role)
    select _id, p.id, 'member' from profiles p
    where p.id = any (coalesce(_members, '{}')) and p.id <> _me
    on conflict do nothing;
  return _id;
end $$;

-- Sends a message + its attachments atomically. Runs as the caller, so RLS applies.
create or replace function public.send_message(
  _id uuid, _conversation uuid, _content text, _type text, _reply_to uuid, _attachments jsonb
) returns uuid language plpgsql security invoker set search_path = public as $$
declare _a jsonb;
begin
  insert into messages (id, conversation_id, sender_id, content, message_type, reply_to)
  values (coalesce(_id, gen_random_uuid()), _conversation, auth.uid(), coalesce(_content, ''), _type, _reply_to)
  returning id into _id;
  for _a in select * from jsonb_array_elements(coalesce(_attachments, '[]'::jsonb)) loop
    insert into attachments (message_id, storage_path, file_name, file_type, file_size)
    values (_id, _a ->> 'storage_path', _a ->> 'file_name', _a ->> 'file_type', (_a ->> 'file_size')::bigint);
  end loop;
  return _id;
end $$;

-- Marks every incoming message in a conversation as read; returns how many were newly marked.
create or replace function public.mark_conversation_read(_conversation uuid)
returns integer language plpgsql security invoker set search_path = public as $$
declare _n integer;
begin
  insert into message_reads (message_id, conversation_id, user_id)
  select m.id, m.conversation_id, auth.uid()
  from messages m
  where m.conversation_id = _conversation and m.sender_id <> auth.uid() and m.deleted_at is null
    and not exists (select 1 from message_reads r where r.message_id = m.id and r.user_id = auth.uid())
  on conflict do nothing;
  get diagnostics _n = row_count;
  return _n;
end $$;

create or replace function public.get_chat_list()
returns table (
  id uuid, type text, name text, avatar_url text, description text, created_by uuid,
  created_at timestamptz, last_message_at timestamptz, my_role text,
  other_user_id uuid, other_full_name text, other_username text, other_avatar_url text,
  last_message_id uuid, last_message_content text, last_message_type text,
  last_message_sender_id uuid, last_message_sender_name text, last_message_created_at timestamptz,
  last_message_deleted boolean, unread_count bigint
) language sql stable security invoker set search_path = public as $$
  select c.id, c.type, c.name, c.avatar_url, c.description, c.created_by, c.created_at,
         coalesce(c.last_message_at, c.created_at), me.role,
         o.user_id, o.full_name, o.username, o.avatar_url,
         lm.id, lm.content, lm.message_type, lm.sender_id, lp.full_name, lm.created_at,
         (lm.deleted_at is not null),
         (select count(*) from messages m
           where m.conversation_id = c.id and m.sender_id <> auth.uid() and m.deleted_at is null
             and not exists (select 1 from message_reads r where r.message_id = m.id and r.user_id = auth.uid()))
  from conversations c
  join conversation_members me on me.conversation_id = c.id and me.user_id = auth.uid()
  left join lateral (
    select cm.user_id, p.full_name, p.username, p.avatar_url
    from conversation_members cm join profiles p on p.id = cm.user_id
    where c.type = 'direct' and cm.conversation_id = c.id and cm.user_id <> auth.uid() limit 1
  ) o on true
  left join lateral (
    select * from messages m where m.conversation_id = c.id order by m.created_at desc limit 1
  ) lm on true
  left join profiles lp on lp.id = lm.sender_id
  order by coalesce(c.last_message_at, c.created_at) desc;
$$;

create or replace function public.search_messages(_query text)
returns table (id uuid, conversation_id uuid, sender_id uuid, sender_name text, content text, created_at timestamptz)
language sql stable security invoker set search_path = public as $$
  select m.id, m.conversation_id, m.sender_id, p.full_name, m.content, m.created_at
  from messages m join profiles p on p.id = m.sender_id
  where m.deleted_at is null and char_length(btrim(_query)) >= 2
    and m.content ilike '%' || replace(replace(replace(btrim(_query), '\', '\\'), '%', '\%'), '_', '\_') || '%'
  order by m.created_at desc
  limit 30;
$$;

-- Presence-adjacent helpers -------------------------------------------------

create or replace function public.touch_last_seen()
returns void language sql security definer set search_path = public as $$
  update profiles set last_seen = now() where id = auth.uid();
$$;

-- Last seen is hidden at the database level for users who turned it off.
create or replace function public.get_last_seens(_ids uuid[])
returns table (user_id uuid, last_seen timestamptz)
language sql stable security definer set search_path = public as $$
  select id, case when show_last_seen or id = auth.uid() then last_seen end
  from profiles where id = any (_ids) and auth.uid() is not null;
$$;

grant execute on function
  public.create_direct_conversation(uuid), public.create_group(text, text, text, uuid[]),
  public.send_message(uuid, uuid, text, text, uuid, jsonb), public.mark_conversation_read(uuid),
  public.get_chat_list(), public.search_messages(text), public.touch_last_seen(),
  public.get_last_seens(uuid[])
to authenticated;
revoke execute on function
  public.create_direct_conversation(uuid), public.create_group(text, text, text, uuid[]),
  public.send_message(uuid, uuid, text, text, uuid, jsonb), public.mark_conversation_read(uuid),
  public.get_chat_list(), public.search_messages(text), public.touch_last_seen(),
  public.get_last_seens(uuid[])
from anon, public;

-- ───────────────────────── Row Level Security ─────────────────────────

alter table public.profiles             enable row level security;
alter table public.conversations        enable row level security;
alter table public.conversation_members enable row level security;
alter table public.messages             enable row level security;
alter table public.message_reactions    enable row level security;
alter table public.message_reads        enable row level security;
alter table public.attachments          enable row level security;

-- profiles: any signed-in user can find others; only you can edit yourself.
-- `last_seen` is not selectable directly (see get_last_seens) so the privacy setting is enforced.
create policy "profiles readable by signed-in users" on public.profiles for select to authenticated using (true);
create policy "update own profile" on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());
revoke all on public.profiles from anon, authenticated;
grant select (id, full_name, username, avatar_url, about, show_online, show_last_seen, created_at, updated_at)
  on public.profiles to authenticated;
grant update (full_name, username, avatar_url, about, show_online, show_last_seen)
  on public.profiles to authenticated;

-- conversations: members read; group admins edit. Creation goes through RPCs.
create policy "members read conversations" on public.conversations for select to authenticated
  using (public.is_member(id));
create policy "admins update groups" on public.conversations for update to authenticated
  using (type = 'group' and public.is_admin(id)) with check (type = 'group' and public.is_admin(id));
revoke all on public.conversations from anon, authenticated;
grant select on public.conversations to authenticated;
grant update (name, avatar_url, description) on public.conversations to authenticated;

-- members
create policy "members read members" on public.conversation_members for select to authenticated
  using (public.is_member(conversation_id));
create policy "admins add members" on public.conversation_members for insert to authenticated
  with check (public.is_group(conversation_id) and public.is_admin(conversation_id) and role = 'member');
create policy "admins change roles" on public.conversation_members for update to authenticated
  using (public.is_group(conversation_id) and public.is_admin(conversation_id))
  with check (public.is_group(conversation_id) and public.is_admin(conversation_id));
create policy "admins remove members or leave" on public.conversation_members for delete to authenticated
  using (public.is_group(conversation_id) and (public.is_admin(conversation_id) or user_id = auth.uid()));
revoke all on public.conversation_members from anon, authenticated;
grant select, insert, delete on public.conversation_members to authenticated;
grant update (role) on public.conversation_members to authenticated;

-- messages
create policy "members read messages" on public.messages for select to authenticated
  using (public.is_member(conversation_id));
create policy "members send messages" on public.messages for insert to authenticated
  with check (sender_id = auth.uid() and public.is_member(conversation_id));
create policy "senders edit own messages" on public.messages for update to authenticated
  using (sender_id = auth.uid() and deleted_at is null and public.is_member(conversation_id))
  with check (sender_id = auth.uid() and public.is_member(conversation_id));
revoke all on public.messages from anon, authenticated;
grant select, insert on public.messages to authenticated;
grant update (content, deleted_at) on public.messages to authenticated;   -- no DELETE: history is soft-deleted

-- reactions
create policy "members read reactions" on public.message_reactions for select to authenticated
  using (public.is_member(conversation_id));
create policy "members add own reactions" on public.message_reactions for insert to authenticated
  with check (user_id = auth.uid() and exists (
    select 1 from public.messages m where m.id = message_id and public.is_member(m.conversation_id)));
create policy "remove own reactions" on public.message_reactions for delete to authenticated
  using (user_id = auth.uid());
revoke all on public.message_reactions from anon, authenticated;
grant select, insert, delete on public.message_reactions to authenticated;

-- read receipts
create policy "members read receipts" on public.message_reads for select to authenticated
  using (public.is_member(conversation_id));
create policy "members write own receipts" on public.message_reads for insert to authenticated
  with check (user_id = auth.uid() and exists (
    select 1 from public.messages m where m.id = message_id and public.is_member(m.conversation_id)));
revoke all on public.message_reads from anon, authenticated;
grant select, insert on public.message_reads to authenticated;

-- attachments: only the message's sender may attach files to it.
create policy "members read attachments" on public.attachments for select to authenticated
  using (public.is_member(conversation_id));
create policy "senders add attachments" on public.attachments for insert to authenticated
  with check (exists (select 1 from public.messages m
                      where m.id = message_id and m.sender_id = auth.uid() and public.is_member(m.conversation_id)));
revoke all on public.attachments from anon, authenticated;
grant select, insert on public.attachments to authenticated;

-- ───────────────────────── Storage ─────────────────────────

-- Avatars: public bucket (profile pictures are visible to everyone anyway). Write access only inside your own folder.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 3145728, array['image/jpeg', 'image/png', 'image/webp', 'image/gif'])
on conflict (id) do update set file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- Attachments: PRIVATE. Path = <conversation_id>/<uuid>/<file>. Access = membership of that conversation.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('attachments', 'attachments', false, 26214400, array[
  'image/jpeg', 'image/png', 'image/webp', 'image/gif',
  'application/pdf', 'text/plain', 'text/csv', 'application/zip', 'application/json',
  'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'audio/mpeg', 'audio/wav', 'audio/ogg', 'video/mp4', 'video/webm'])
on conflict (id) do update set file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create or replace function public.storage_conversation(_name text)
returns uuid language sql immutable as $$
  select case when split_part(_name, '/', 1) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
              then split_part(_name, '/', 1)::uuid end;
$$;

create policy "avatars public read" on storage.objects for select using (bucket_id = 'avatars');
create policy "avatars write own folder" on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "avatars update own folder" on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "avatars delete own folder" on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "attachments members read" on storage.objects for select to authenticated
  using (bucket_id = 'attachments' and public.is_member(public.storage_conversation(name)));
create policy "attachments members upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'attachments' and public.is_member(public.storage_conversation(name)));

-- ───────────────────────── Realtime ─────────────────────────

alter publication supabase_realtime add table
  public.messages, public.message_reactions, public.message_reads, public.attachments,
  public.conversation_members, public.conversations;

-- Private broadcast/presence channels: 'lobby' (global presence) and 'conv:<id>' (typing).
create or replace function public.can_use_topic(_topic text)
returns boolean language sql stable security definer set search_path = public as $$
  select case
    when _topic = 'lobby' then auth.uid() is not null
    when _topic ~ '^conv:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then public.is_member(substr(_topic, 6)::uuid)
    else false
  end;
$$;

create policy "realtime receive" on realtime.messages for select to authenticated
  using (public.can_use_topic(realtime.topic()));
create policy "realtime send" on realtime.messages for insert to authenticated
  with check (public.can_use_topic(realtime.topic()));
