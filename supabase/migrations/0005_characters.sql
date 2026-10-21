-- 0005: characters (pinned to a published template version) and restore points.
-- Run once in Supabase -> SQL Editor (New query). Safe to re-run.

create table if not exists public.characters (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  -- No "on delete" rule: a template version in use can't be deleted.
  template_version_id uuid not null references public.sheet_template_versions (id),
  data jsonb not null default '{}'::jsonb
    check (jsonb_typeof(data) = 'object' and octet_length(data::text) < 262144),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists characters_owner_idx on public.characters (owner_id);
create index if not exists characters_version_idx on public.characters (template_version_id);

create table if not exists public.character_snapshots (
  id uuid primary key default gen_random_uuid(),
  character_id uuid not null references public.characters (id) on delete cascade,
  label text not null default '' check (char_length(label) <= 80),
  reason text not null check (reason in ('manual', 'before_restore')),
  data jsonb not null,
  created_at timestamptz not null default now()
);
create index if not exists character_snapshots_character_idx
  on public.character_snapshots (character_id, created_at desc);

alter table public.characters enable row level security;
alter table public.character_snapshots enable row level security;
revoke all on public.characters from anon, authenticated;
revoke all on public.character_snapshots from anon, authenticated;

-- Every change gets a fresh timestamp, which autosave uses to spot
-- edits made on another device in the meantime.
create or replace function public.characters_touch()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := clock_timestamp();
  return new;
end;
$$;

drop trigger if exists characters_touch on public.characters;
create trigger characters_touch
  before update on public.characters
  for each row execute function public.characters_touch();

create or replace function public.owns_character(p_character uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.characters
    where id = p_character and owner_id = auth.uid()
  );
$$;
revoke execute on function public.owns_character(uuid) from public, anon;
grant execute on function public.owns_character(uuid) to authenticated;

grant select on public.characters to authenticated;
grant update (name, data) on public.characters to authenticated;

drop policy if exists "Owners see their characters" on public.characters;
create policy "Owners see their characters"
  on public.characters for select to authenticated
  using (owner_id = (select auth.uid()));

drop policy if exists "Owners edit their characters" on public.characters;
create policy "Owners edit their characters"
  on public.characters for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

grant select on public.character_snapshots to authenticated;

drop policy if exists "Owners see their restore points" on public.character_snapshots;
create policy "Owners see their restore points"
  on public.character_snapshots for select to authenticated
  using (public.owns_character(character_id));

-- ---------------------------------------------------------------
-- Actions
-- ---------------------------------------------------------------

-- Who may build a character from this version? For now: the template owner.
-- (Phase 4b adds templates a campaign offers to its members.)
create or replace function public.can_use_template_version(p_version uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1
    from public.sheet_template_versions v
    join public.sheet_templates t on t.id = v.template_id
    where v.id = p_version and v.status = 'published' and t.owner_id = auth.uid()
  );
$$;
revoke execute on function public.can_use_template_version(uuid) from public, anon;
grant execute on function public.can_use_template_version(uuid) to authenticated;

create or replace function public.create_character(p_name text, p_template_version uuid)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_id uuid;
begin
  if auth.uid() is null then raise exception 'not_signed_in'; end if;
  if exists (select 1 from public.sheet_template_versions
             where id = p_template_version and status = 'draft') then
    raise exception 'not_published';
  end if;
  if not public.can_use_template_version(p_template_version) then
    raise exception 'not_allowed';
  end if;
  insert into public.characters (owner_id, name, template_version_id)
  values (auth.uid(), trim(p_name), p_template_version)
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.duplicate_character(p_character uuid)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_source public.characters;
  v_id uuid;
begin
  if not public.owns_character(p_character) then raise exception 'not_allowed'; end if;
  select * into v_source from public.characters where id = p_character;
  insert into public.characters (owner_id, name, template_version_id, data)
  values (auth.uid(), left('Copy of ' || v_source.name, 80), v_source.template_version_id, v_source.data)
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.delete_character(p_character uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not public.owns_character(p_character) then raise exception 'not_allowed'; end if;
  delete from public.characters where id = p_character;
end;
$$;

-- Saves the character as it is now. Keeps the newest 50 restore points.
create or replace function public.create_character_snapshot(p_character uuid, p_label text default '')
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_id uuid;
begin
  if not public.owns_character(p_character) then raise exception 'not_allowed'; end if;
  insert into public.character_snapshots (character_id, label, reason, data)
  select id, left(trim(coalesce(p_label, '')), 80), 'manual', data
  from public.characters where id = p_character
  returning id into v_id;

  delete from public.character_snapshots
  where character_id = p_character and id in (
    select id from public.character_snapshots
    where character_id = p_character
    order by created_at desc
    offset 50
  );
  return v_id;
end;
$$;

-- Puts a restore point back, saving the current state first so it can be undone.
create or replace function public.restore_character_snapshot(p_snapshot uuid)
returns timestamptz
language plpgsql security definer set search_path = ''
as $$
declare
  v_snapshot public.character_snapshots;
  v_updated timestamptz;
begin
  select * into v_snapshot from public.character_snapshots where id = p_snapshot;
  if v_snapshot.id is null or not public.owns_character(v_snapshot.character_id) then
    raise exception 'not_allowed';
  end if;

  insert into public.character_snapshots (character_id, label, reason, data)
  select id, 'Before restoring', 'before_restore', data
  from public.characters where id = v_snapshot.character_id;

  update public.characters set data = v_snapshot.data
  where id = v_snapshot.character_id
  returning updated_at into v_updated;
  return v_updated;
end;
$$;

create or replace function public.delete_character_snapshot(p_snapshot uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_character uuid;
begin
  select character_id into v_character from public.character_snapshots where id = p_snapshot;
  if v_character is null or not public.owns_character(v_character) then
    raise exception 'not_allowed';
  end if;
  delete from public.character_snapshots where id = p_snapshot;
end;
$$;

-- Templates can't be deleted while a character still uses one of their versions.
create or replace function public.delete_template(p_template uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not public.owns_template(p_template) then raise exception 'not_allowed'; end if;
  if exists (
    select 1 from public.characters c
    join public.sheet_template_versions v on v.id = c.template_version_id
    where v.template_id = p_template
  ) then
    raise exception 'template_in_use';
  end if;
  delete from public.sheet_templates where id = p_template;
end;
$$;

revoke execute on function public.create_character(text, uuid) from public, anon;
revoke execute on function public.duplicate_character(uuid) from public, anon;
revoke execute on function public.delete_character(uuid) from public, anon;
revoke execute on function public.create_character_snapshot(uuid, text) from public, anon;
revoke execute on function public.restore_character_snapshot(uuid) from public, anon;
revoke execute on function public.delete_character_snapshot(uuid) from public, anon;
revoke execute on function public.delete_template(uuid) from public, anon;
grant execute on function public.create_character(text, uuid) to authenticated;
grant execute on function public.duplicate_character(uuid) to authenticated;
grant execute on function public.delete_character(uuid) to authenticated;
grant execute on function public.create_character_snapshot(uuid, text) to authenticated;
grant execute on function public.restore_character_snapshot(uuid) to authenticated;
grant execute on function public.delete_character_snapshot(uuid) to authenticated;
grant execute on function public.delete_template(uuid) to authenticated;
