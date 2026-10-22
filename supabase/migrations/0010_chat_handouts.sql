-- 0010: live campaign chat with whispers, and handouts with private files.
-- Run once in Supabase -> SQL Editor (New query). Safe to re-run.

-- ---------------------------------------------------------------
-- Chat
-- ---------------------------------------------------------------
create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns (id) on delete cascade,
  author_id uuid default auth.uid() references auth.users (id) on delete set null,
  body text not null check (char_length(body) between 1 and 2000),
  -- null = everyone in the campaign; otherwise a whisper to these people
  recipients uuid[] check (recipients is null or (cardinality(recipients) between 1 and 50)),
  created_at timestamptz not null default now(),
  edited_at timestamptz
);
create index if not exists messages_campaign_idx on public.messages (campaign_id, created_at desc);
create index if not exists messages_author_recent_idx on public.messages (author_id, created_at desc);

alter table public.messages enable row level security;
revoke all on public.messages from anon, authenticated;

-- Whisper rule: DMs and Co-DMs may whisper to any members; players may only
-- whisper to DMs and Co-DMs. Everyone must be in the campaign.
create or replace function public.whisper_allowed(p_campaign uuid, p_recipients uuid[])
returns boolean
language sql stable security definer set search_path = ''
as $$
  select p_recipients is null
    or (
      not exists (
        select 1 from unnest(p_recipients) r(id)
        where not exists (
          select 1 from public.campaign_members m
          where m.campaign_id = p_campaign and m.user_id = r.id
            and (public.is_campaign_manager(p_campaign) or m.role in ('owner', 'co_dm'))
        )
      )
    );
$$;

create or replace function public.can_read_message(p_campaign uuid, p_author uuid, p_recipients uuid[])
returns boolean
language sql stable security definer set search_path = ''
as $$
  select public.is_campaign_member(p_campaign)
    and (
      p_recipients is null
      or p_author = auth.uid()
      or auth.uid() = any (p_recipients)
      or public.is_campaign_manager(p_campaign)
    );
$$;

revoke execute on function public.whisper_allowed(uuid, uuid[]) from public, anon;
revoke execute on function public.can_read_message(uuid, uuid, uuid[]) from public, anon;
grant execute on function public.whisper_allowed(uuid, uuid[]) to authenticated;
grant execute on function public.can_read_message(uuid, uuid, uuid[]) to authenticated;

grant select, delete on public.messages to authenticated;
grant insert (campaign_id, body, recipients) on public.messages to authenticated;
grant update (body) on public.messages to authenticated;

drop policy if exists "Read messages" on public.messages;
create policy "Read messages" on public.messages for select to authenticated
  using (public.can_read_message(campaign_id, author_id, recipients));
drop policy if exists "Send messages" on public.messages;
create policy "Send messages" on public.messages for insert to authenticated
  with check (
    author_id = (select auth.uid())
    and public.is_campaign_member(campaign_id)
    and public.whisper_allowed(campaign_id, recipients)
  );
drop policy if exists "Edit own messages" on public.messages;
create policy "Edit own messages" on public.messages for update to authenticated
  using (author_id = (select auth.uid())) with check (author_id = (select auth.uid()));
drop policy if exists "Delete messages" on public.messages;
create policy "Delete messages" on public.messages for delete to authenticated
  using (author_id = (select auth.uid()) or public.is_campaign_manager(campaign_id));

-- Spam guard and "edited" marker.
create or replace function public.messages_before_write()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if (select count(*) from public.messages
        where author_id = new.author_id and created_at > now() - interval '10 seconds') >= 10 then
      raise exception 'slow_down';
    end if;
  elsif new.body is distinct from old.body then
    new.edited_at := now();
  end if;
  return new;
end;
$$;
drop trigger if exists messages_before_write on public.messages;
create trigger messages_before_write before insert or update on public.messages
  for each row execute function public.messages_before_write();

-- A DM deleting someone else's message is recorded in the activity log.
create or replace function public.audit_message_delete()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if old.author_id is distinct from auth.uid() then
    perform public.log_activity(old.campaign_id, 'message_deleted', jsonb_build_object('user_id', old.author_id));
  end if;
  return null;
end;
$$;
drop trigger if exists audit_message_delete on public.messages;
create trigger audit_message_delete after delete on public.messages
  for each row execute function public.audit_message_delete();

-- Live updates for chat (respects the read rules above).
do $$ begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'messages'
  ) then
    alter publication supabase_realtime add table public.messages;
  end if;
end $$;

-- ---------------------------------------------------------------
-- Handouts
-- ---------------------------------------------------------------
create table if not exists public.handouts (
  id uuid primary key,
  campaign_id uuid not null references public.campaigns (id) on delete cascade,
  author_id uuid default auth.uid() references auth.users (id) on delete set null,
  title text not null check (char_length(title) between 1 and 120),
  body text not null default '' check (char_length(body) <= 10000),
  visibility text not null default 'all' check (visibility in ('all', 'selected', 'dm_only')),
  file_path text check (file_path is null or file_path like campaign_id::text || '/' || id::text || '/%'),
  file_name text check (file_name is null or char_length(file_name) <= 200),
  file_type text check (file_type is null or file_type in ('image/jpeg', 'image/png', 'image/webp', 'application/pdf')),
  file_size integer check (file_size is null or file_size between 1 and 10485760),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists handouts_campaign_idx on public.handouts (campaign_id, created_at desc);

create table if not exists public.handout_recipients (
  handout_id uuid not null references public.handouts (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  primary key (handout_id, user_id)
);

alter table public.handouts enable row level security;
alter table public.handout_recipients enable row level security;
revoke all on public.handouts from anon, authenticated;
revoke all on public.handout_recipients from anon, authenticated;

drop trigger if exists handouts_touch on public.handouts;
create trigger handouts_touch before update on public.handouts
  for each row execute function public.touch_updated_at();

create or replace function public.can_read_handout(p_handout uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.handouts h
    where h.id = p_handout
      and (
        public.is_campaign_manager(h.campaign_id)
        or (h.visibility = 'all' and public.is_campaign_member(h.campaign_id))
        or (h.visibility = 'selected' and public.is_campaign_member(h.campaign_id) and exists (
              select 1 from public.handout_recipients r where r.handout_id = h.id and r.user_id = auth.uid()))
      )
  );
$$;
revoke execute on function public.can_read_handout(uuid) from public, anon;
grant execute on function public.can_read_handout(uuid) to authenticated;

grant select, delete on public.handouts to authenticated;
grant insert (id, campaign_id, title, body, visibility, file_path, file_name, file_type, file_size) on public.handouts to authenticated;
grant update (title, body, visibility) on public.handouts to authenticated;

drop policy if exists "Read handouts" on public.handouts;
create policy "Read handouts" on public.handouts for select to authenticated
  using (public.can_read_handout(id));
drop policy if exists "Managers add handouts" on public.handouts;
create policy "Managers add handouts" on public.handouts for insert to authenticated
  with check (public.is_campaign_manager(campaign_id) and author_id = (select auth.uid()));
drop policy if exists "Managers edit handouts" on public.handouts;
create policy "Managers edit handouts" on public.handouts for update to authenticated
  using (public.is_campaign_manager(campaign_id)) with check (public.is_campaign_manager(campaign_id));
drop policy if exists "Managers delete handouts" on public.handouts;
create policy "Managers delete handouts" on public.handouts for delete to authenticated
  using (public.is_campaign_manager(campaign_id));

-- Recipients: managers manage; each person can see their own entries.
grant select, insert, delete on public.handout_recipients to authenticated;
drop policy if exists "See handout recipients" on public.handout_recipients;
create policy "See handout recipients" on public.handout_recipients for select to authenticated
  using (
    user_id = (select auth.uid())
    or exists (select 1 from public.handouts h where h.id = handout_id and public.is_campaign_manager(h.campaign_id))
  );
drop policy if exists "Managers choose recipients" on public.handout_recipients;
create policy "Managers choose recipients" on public.handout_recipients for insert to authenticated
  with check (exists (
    select 1 from public.handouts h
    join public.campaign_members m on m.campaign_id = h.campaign_id and m.user_id = handout_recipients.user_id
    where h.id = handout_id and public.is_campaign_manager(h.campaign_id)
  ));
drop policy if exists "Managers remove recipients" on public.handout_recipients;
create policy "Managers remove recipients" on public.handout_recipients for delete to authenticated
  using (exists (select 1 from public.handouts h where h.id = handout_id and public.is_campaign_manager(h.campaign_id)));

create or replace function public.audit_handouts()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    perform public.log_activity(new.campaign_id, 'handout_created', jsonb_build_object('title', new.title));
  else
    perform public.log_activity(old.campaign_id, 'handout_deleted', jsonb_build_object('title', old.title));
  end if;
  return null;
end;
$$;
drop trigger if exists audit_handouts on public.handouts;
create trigger audit_handouts after insert or delete on public.handouts
  for each row execute function public.audit_handouts();

-- ---------------------------------------------------------------
-- File storage: a private bucket. Files live at
-- <campaign id>/<handout id>/<file name>.
-- ---------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('handouts', 'handouts', false, 10485760,
        array['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

create or replace function public.handout_folder_campaign(p_name text)
returns uuid
language plpgsql immutable
set search_path = ''
as $$
declare
  v_first text := split_part(p_name, '/', 1);
begin
  return v_first::uuid;
exception when others then
  return null;
end;
$$;

create or replace function public.can_read_handout_file(p_name text)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.handouts h
    where h.file_path = p_name and public.can_read_handout(h.id)
  );
$$;
revoke execute on function public.can_read_handout_file(text) from public, anon;
grant execute on function public.can_read_handout_file(text) to authenticated;
grant execute on function public.handout_folder_campaign(text) to authenticated;

drop policy if exists "Handout files: read" on storage.objects;
create policy "Handout files: read" on storage.objects for select to authenticated
  using (
    bucket_id = 'handouts'
    and (public.can_read_handout_file(name)
         or coalesce(public.is_campaign_manager(public.handout_folder_campaign(name)), false))
  );

drop policy if exists "Handout files: upload" on storage.objects;
create policy "Handout files: upload" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'handouts'
    and coalesce(public.is_campaign_manager(public.handout_folder_campaign(name)), false)
  );

drop policy if exists "Handout files: delete" on storage.objects;
create policy "Handout files: delete" on storage.objects for delete to authenticated
  using (
    bucket_id = 'handouts'
    and coalesce(public.is_campaign_manager(public.handout_folder_campaign(name)), false)
  );
