-- 0009: announcements, session logs, private DM notes and the activity log.
-- Run once in Supabase -> SQL Editor (New query). Safe to re-run.

alter table public.campaigns
  add column if not exists players_write_logs boolean not null default false;
grant update (players_write_logs) on public.campaigns to authenticated;

create table if not exists public.announcements (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns (id) on delete cascade,
  author_id uuid default auth.uid() references auth.users (id) on delete set null,
  title text not null check (char_length(title) between 1 and 120),
  body text not null default '' check (char_length(body) <= 5000),
  pinned boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists announcements_campaign_idx on public.announcements (campaign_id, pinned desc, created_at desc);

create table if not exists public.session_logs (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns (id) on delete cascade,
  author_id uuid default auth.uid() references auth.users (id) on delete set null,
  session_number integer check (session_number is null or session_number between 0 and 10000),
  played_on date,
  title text not null check (char_length(title) between 1 and 120),
  body text not null default '' check (char_length(body) <= 20000),
  visibility text not null default 'players' check (visibility in ('players', 'dm_only')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists session_logs_campaign_idx on public.session_logs (campaign_id, session_number desc, created_at desc);

-- DM notes live in their own table so nothing players can read ever touches them.
create table if not exists public.dm_notes (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns (id) on delete cascade,
  author_id uuid default auth.uid() references auth.users (id) on delete set null,
  title text not null check (char_length(title) between 1 and 120),
  body text not null default '' check (char_length(body) <= 20000),
  character_id uuid references public.characters (id) on delete set null,
  session_log_id uuid references public.session_logs (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists dm_notes_campaign_idx on public.dm_notes (campaign_id, updated_at desc);

create table if not exists public.audit_log (
  id bigint generated always as identity primary key,
  campaign_id uuid not null references public.campaigns (id) on delete cascade,
  actor_id uuid references auth.users (id) on delete set null,
  action text not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists audit_log_campaign_idx on public.audit_log (campaign_id, created_at desc);

alter table public.announcements enable row level security;
alter table public.session_logs enable row level security;
alter table public.dm_notes enable row level security;
alter table public.audit_log enable row level security;
revoke all on public.announcements from anon, authenticated;
revoke all on public.session_logs from anon, authenticated;
revoke all on public.dm_notes from anon, authenticated;
revoke all on public.audit_log from anon, authenticated;

-- Keep "updated" times fresh.
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists announcements_touch on public.announcements;
create trigger announcements_touch before update on public.announcements
  for each row execute function public.touch_updated_at();
drop trigger if exists session_logs_touch on public.session_logs;
create trigger session_logs_touch before update on public.session_logs
  for each row execute function public.touch_updated_at();
drop trigger if exists dm_notes_touch on public.dm_notes;
create trigger dm_notes_touch before update on public.dm_notes
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------
-- Announcements: members read; DMs and Co-DMs write.
-- ---------------------------------------------------------------
grant select, delete on public.announcements to authenticated;
grant insert (campaign_id, title, body, pinned) on public.announcements to authenticated;
grant update (title, body, pinned) on public.announcements to authenticated;

drop policy if exists "Members read announcements" on public.announcements;
create policy "Members read announcements" on public.announcements for select to authenticated
  using (public.is_campaign_member(campaign_id));
drop policy if exists "Managers post announcements" on public.announcements;
create policy "Managers post announcements" on public.announcements for insert to authenticated
  with check (public.is_campaign_manager(campaign_id) and author_id = (select auth.uid()));
drop policy if exists "Managers edit announcements" on public.announcements;
create policy "Managers edit announcements" on public.announcements for update to authenticated
  using (public.is_campaign_manager(campaign_id)) with check (public.is_campaign_manager(campaign_id));
drop policy if exists "Managers delete announcements" on public.announcements;
create policy "Managers delete announcements" on public.announcements for delete to authenticated
  using (public.is_campaign_manager(campaign_id));

-- ---------------------------------------------------------------
-- Session logs: DM-only logs are visible to managers only. Players may
-- write player-visible logs when the campaign allows it.
-- ---------------------------------------------------------------
create or replace function public.players_may_write_logs(p_campaign uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce((select players_write_logs from public.campaigns where id = p_campaign), false)
    and public.is_campaign_member(p_campaign);
$$;
revoke execute on function public.players_may_write_logs(uuid) from public, anon;
grant execute on function public.players_may_write_logs(uuid) to authenticated;

grant select, delete on public.session_logs to authenticated;
grant insert (campaign_id, session_number, played_on, title, body, visibility) on public.session_logs to authenticated;
grant update (session_number, played_on, title, body, visibility) on public.session_logs to authenticated;

drop policy if exists "Read session logs" on public.session_logs;
create policy "Read session logs" on public.session_logs for select to authenticated
  using (
    public.is_campaign_manager(campaign_id)
    or (visibility = 'players' and public.is_campaign_member(campaign_id))
  );
drop policy if exists "Write session logs" on public.session_logs;
create policy "Write session logs" on public.session_logs for insert to authenticated
  with check (
    author_id = (select auth.uid())
    and (
      public.is_campaign_manager(campaign_id)
      or (visibility = 'players' and public.players_may_write_logs(campaign_id))
    )
  );
drop policy if exists "Edit session logs" on public.session_logs;
create policy "Edit session logs" on public.session_logs for update to authenticated
  using (
    public.is_campaign_manager(campaign_id)
    or (author_id = (select auth.uid()) and visibility = 'players' and public.players_may_write_logs(campaign_id))
  )
  with check (
    public.is_campaign_manager(campaign_id)
    or (author_id = (select auth.uid()) and visibility = 'players' and public.players_may_write_logs(campaign_id))
  );
drop policy if exists "Delete session logs" on public.session_logs;
create policy "Delete session logs" on public.session_logs for delete to authenticated
  using (
    public.is_campaign_manager(campaign_id)
    or (author_id = (select auth.uid()) and visibility = 'players')
  );

-- ---------------------------------------------------------------
-- DM notes: managers only, for every operation. Links must point at
-- characters and logs from the same campaign.
-- ---------------------------------------------------------------
grant select, delete on public.dm_notes to authenticated;
grant insert (campaign_id, title, body, character_id, session_log_id) on public.dm_notes to authenticated;
grant update (title, body, character_id, session_log_id) on public.dm_notes to authenticated;

create or replace function public.dm_note_links_ok(p_campaign uuid, p_character uuid, p_log uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select (p_character is null or exists (
            select 1 from public.campaign_characters
            where campaign_id = p_campaign and character_id = p_character))
     and (p_log is null or exists (
            select 1 from public.session_logs where id = p_log and campaign_id = p_campaign));
$$;
revoke execute on function public.dm_note_links_ok(uuid, uuid, uuid) from public, anon;
grant execute on function public.dm_note_links_ok(uuid, uuid, uuid) to authenticated;

drop policy if exists "Managers read DM notes" on public.dm_notes;
create policy "Managers read DM notes" on public.dm_notes for select to authenticated
  using (public.is_campaign_manager(campaign_id));
drop policy if exists "Managers write DM notes" on public.dm_notes;
create policy "Managers write DM notes" on public.dm_notes for insert to authenticated
  with check (
    public.is_campaign_manager(campaign_id)
    and author_id = (select auth.uid())
    and public.dm_note_links_ok(campaign_id, character_id, session_log_id)
  );
drop policy if exists "Managers edit DM notes" on public.dm_notes;
create policy "Managers edit DM notes" on public.dm_notes for update to authenticated
  using (public.is_campaign_manager(campaign_id))
  with check (
    public.is_campaign_manager(campaign_id)
    and public.dm_note_links_ok(campaign_id, character_id, session_log_id)
  );
drop policy if exists "Managers delete DM notes" on public.dm_notes;
create policy "Managers delete DM notes" on public.dm_notes for delete to authenticated
  using (public.is_campaign_manager(campaign_id));

-- ---------------------------------------------------------------
-- Activity log: written only by the triggers below, read by managers.
-- ---------------------------------------------------------------
grant select on public.audit_log to authenticated;
drop policy if exists "Managers read the activity log" on public.audit_log;
create policy "Managers read the activity log" on public.audit_log for select to authenticated
  using (public.is_campaign_manager(campaign_id));

create or replace function public.log_activity(p_campaign uuid, p_action text, p_details jsonb)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  -- Skip when the campaign itself is being deleted.
  if exists (select 1 from public.campaigns where id = p_campaign) then
    insert into public.audit_log (campaign_id, actor_id, action, details)
    values (p_campaign, auth.uid(), p_action, coalesce(p_details, '{}'::jsonb));
  end if;
end;
$$;
revoke execute on function public.log_activity(uuid, text, jsonb) from public, anon, authenticated;

create or replace function public.audit_campaign_members()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    perform public.log_activity(new.campaign_id, 'member_joined',
      jsonb_build_object('user_id', new.user_id, 'role', new.role));
  elsif tg_op = 'UPDATE' and new.role is distinct from old.role then
    perform public.log_activity(new.campaign_id, 'role_changed',
      jsonb_build_object('user_id', new.user_id, 'from', old.role, 'to', new.role));
  elsif tg_op = 'DELETE' then
    perform public.log_activity(old.campaign_id,
      case when old.user_id = auth.uid() then 'member_left' else 'member_removed' end,
      jsonb_build_object('user_id', old.user_id));
  end if;
  return null;
end;
$$;
drop trigger if exists audit_campaign_members on public.campaign_members;
create trigger audit_campaign_members after insert or update or delete on public.campaign_members
  for each row execute function public.audit_campaign_members();

create or replace function public.audit_campaigns()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.name is distinct from old.name then
    perform public.log_activity(new.id, 'campaign_renamed', jsonb_build_object('from', old.name, 'to', new.name));
  end if;
  if new.status is distinct from old.status then
    perform public.log_activity(new.id, case when new.status = 'archived' then 'campaign_archived' else 'campaign_restored' end, '{}'::jsonb);
  end if;
  if new.players_see_full_sheets is distinct from old.players_see_full_sheets then
    perform public.log_activity(new.id, 'setting_changed', jsonb_build_object('setting', 'players_see_full_sheets', 'value', new.players_see_full_sheets));
  end if;
  if new.spells_need_approval is distinct from old.spells_need_approval then
    perform public.log_activity(new.id, 'setting_changed', jsonb_build_object('setting', 'spells_need_approval', 'value', new.spells_need_approval));
  end if;
  if new.players_write_logs is distinct from old.players_write_logs then
    perform public.log_activity(new.id, 'setting_changed', jsonb_build_object('setting', 'players_write_logs', 'value', new.players_write_logs));
  end if;
  return null;
end;
$$;
drop trigger if exists audit_campaigns on public.campaigns;
create trigger audit_campaigns after update on public.campaigns
  for each row execute function public.audit_campaigns();

create or replace function public.audit_submissions()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.status is distinct from old.status and new.status <> 'pending' then
    perform public.log_activity(new.campaign_id, 'submission_reviewed',
      jsonb_build_object('submission_id', new.id, 'type', new.content_type, 'decision', new.status, 'user_id', new.submitted_by));
  end if;
  return null;
end;
$$;
drop trigger if exists audit_submissions on public.homebrew_submissions;
create trigger audit_submissions after update on public.homebrew_submissions
  for each row execute function public.audit_submissions();

create or replace function public.audit_invites()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    perform public.log_activity(new.campaign_id, 'invite_created', jsonb_build_object('max_uses', new.max_uses));
  elsif new.revoked_at is not null and old.revoked_at is null then
    perform public.log_activity(new.campaign_id, 'invite_cancelled', '{}'::jsonb);
  end if;
  return null;
end;
$$;
drop trigger if exists audit_invites on public.campaign_invites;
create trigger audit_invites after insert or update on public.campaign_invites
  for each row execute function public.audit_invites();

create or replace function public.audit_campaign_content()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_campaign uuid := coalesce(new.campaign_id, old.campaign_id);
begin
  if tg_table_name = 'campaign_spells' then
    perform public.log_activity(v_campaign, case when tg_op = 'INSERT' then 'spell_added' else 'spell_removed' end,
      jsonb_build_object('version_id', coalesce(new.spell_version_id, old.spell_version_id)));
  elsif tg_table_name = 'campaign_templates' then
    perform public.log_activity(v_campaign, case when tg_op = 'INSERT' then 'template_offered' else 'template_withdrawn' end,
      jsonb_build_object('version_id', coalesce(new.template_version_id, old.template_version_id)));
  elsif tg_table_name = 'session_logs' and tg_op = 'DELETE' then
    perform public.log_activity(v_campaign, 'log_deleted', jsonb_build_object('title', old.title));
  elsif tg_table_name = 'announcements' and tg_op = 'DELETE' then
    perform public.log_activity(v_campaign, 'announcement_deleted', jsonb_build_object('title', old.title));
  end if;
  return null;
end;
$$;
drop trigger if exists audit_campaign_spells on public.campaign_spells;
create trigger audit_campaign_spells after insert or delete on public.campaign_spells
  for each row execute function public.audit_campaign_content();
drop trigger if exists audit_campaign_templates on public.campaign_templates;
create trigger audit_campaign_templates after insert or delete on public.campaign_templates
  for each row execute function public.audit_campaign_content();
drop trigger if exists audit_session_logs on public.session_logs;
create trigger audit_session_logs after delete on public.session_logs
  for each row execute function public.audit_campaign_content();
drop trigger if exists audit_announcements on public.announcements;
create trigger audit_announcements after delete on public.announcements
  for each row execute function public.audit_campaign_content();
