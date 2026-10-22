-- 0007: spells with drafts and frozen versions, effect presets, and
-- spells on characters.
-- Run once in Supabase -> SQL Editor (New query). Safe to re-run.

create table if not exists public.spells (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists spells_owner_idx on public.spells (owner_id);

create table if not exists public.spell_versions (
  id uuid primary key default gen_random_uuid(),
  spell_id uuid not null references public.spells (id) on delete cascade,
  status text not null check (status in ('draft', 'published')),
  version_number integer,
  content jsonb not null
    check (jsonb_typeof(content) = 'object' and octet_length(content::text) < 131072),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  published_at timestamptz,
  check (
    (status = 'draft' and version_number is null and published_at is null)
    or (status = 'published' and version_number >= 1 and published_at is not null)
  ),
  unique (spell_id, version_number)
);
create unique index if not exists spell_versions_one_draft
  on public.spell_versions (spell_id) where status = 'draft';

create table if not exists public.effect_presets (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 60),
  effect jsonb not null check (jsonb_typeof(effect) = 'object' and octet_length(effect::text) < 8192),
  created_at timestamptz not null default now()
);
create index if not exists effect_presets_owner_idx on public.effect_presets (owner_id);

create table if not exists public.character_spells (
  character_id uuid not null references public.characters (id) on delete cascade,
  -- No "on delete" rule: a spell version in use can't be deleted.
  spell_version_id uuid not null references public.spell_versions (id),
  known boolean not null default true,
  prepared boolean not null default false,
  added_at timestamptz not null default now(),
  primary key (character_id, spell_version_id)
);
create index if not exists character_spells_version_idx on public.character_spells (spell_version_id);

alter table public.spells enable row level security;
alter table public.spell_versions enable row level security;
alter table public.effect_presets enable row level security;
alter table public.character_spells enable row level security;
revoke all on public.spells from anon, authenticated;
revoke all on public.spell_versions from anon, authenticated;
revoke all on public.effect_presets from anon, authenticated;
revoke all on public.character_spells from anon, authenticated;

-- Published spell versions are frozen forever.
create or replace function public.spell_versions_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.status = 'published' then
    raise exception 'version_published';
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists spell_versions_guard on public.spell_versions;
create trigger spell_versions_guard
  before update on public.spell_versions
  for each row execute function public.spell_versions_guard();

create or replace function public.owns_spell(p_spell uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.spells where id = p_spell and owner_id = auth.uid());
$$;

-- Readable by the owner, and by anyone who can see a character that has it.
-- (Phase 5b adds spells approved for a campaign.)
create or replace function public.can_read_spell_version(p_version uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.spell_versions v
    join public.spells s on s.id = v.spell_id
    where v.id = p_version and s.owner_id = auth.uid()
  ) or exists (
    select 1 from public.character_spells cs
    where cs.spell_version_id = p_version and public.can_view_character(cs.character_id)
  );
$$;

create or replace function public.can_read_spell(p_spell uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.spell_versions v
    where v.spell_id = p_spell and v.status = 'published' and public.can_read_spell_version(v.id)
  );
$$;

-- Which spell versions may go on a character: your own published ones.
create or replace function public.can_use_spell_version(p_version uuid, p_character uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.spell_versions v
    join public.spells s on s.id = v.spell_id
    where v.id = p_version and v.status = 'published' and s.owner_id = auth.uid()
  );
$$;

revoke execute on function public.owns_spell(uuid) from public, anon;
revoke execute on function public.can_read_spell_version(uuid) from public, anon;
revoke execute on function public.can_read_spell(uuid) from public, anon;
revoke execute on function public.can_use_spell_version(uuid, uuid) from public, anon;
grant execute on function public.owns_spell(uuid) to authenticated;
grant execute on function public.can_read_spell_version(uuid) to authenticated;
grant execute on function public.can_read_spell(uuid) to authenticated;
grant execute on function public.can_use_spell_version(uuid, uuid) to authenticated;

grant select on public.spells to authenticated;
grant update (name) on public.spells to authenticated;

drop policy if exists "Readable spells" on public.spells;
create policy "Readable spells"
  on public.spells for select to authenticated
  using (owner_id = (select auth.uid()) or public.can_read_spell(id));

drop policy if exists "Owners rename spells" on public.spells;
create policy "Owners rename spells"
  on public.spells for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

grant select on public.spell_versions to authenticated;
grant update (content) on public.spell_versions to authenticated;

drop policy if exists "Readable spell versions" on public.spell_versions;
create policy "Readable spell versions"
  on public.spell_versions for select to authenticated
  using (public.owns_spell(spell_id) or (status = 'published' and public.can_read_spell_version(id)));

drop policy if exists "Owners edit spell drafts" on public.spell_versions;
create policy "Owners edit spell drafts"
  on public.spell_versions for update to authenticated
  using (status = 'draft' and public.owns_spell(spell_id))
  with check (status = 'draft' and public.owns_spell(spell_id));

grant select, insert (name, effect), delete on public.effect_presets to authenticated;

drop policy if exists "Owners use presets" on public.effect_presets;
create policy "Owners use presets"
  on public.effect_presets for select to authenticated
  using (owner_id = (select auth.uid()));

drop policy if exists "Owners add presets" on public.effect_presets;
create policy "Owners add presets"
  on public.effect_presets for insert to authenticated
  with check (owner_id = (select auth.uid()));

drop policy if exists "Owners remove presets" on public.effect_presets;
create policy "Owners remove presets"
  on public.effect_presets for delete to authenticated
  using (owner_id = (select auth.uid()));

grant select, delete on public.character_spells to authenticated;
grant update (known, prepared) on public.character_spells to authenticated;

drop policy if exists "Character spells visible with the character" on public.character_spells;
create policy "Character spells visible with the character"
  on public.character_spells for select to authenticated
  using (public.can_view_character(character_id));

drop policy if exists "Owners mark character spells" on public.character_spells;
create policy "Owners mark character spells"
  on public.character_spells for update to authenticated
  using (public.owns_character(character_id))
  with check (public.owns_character(character_id));

drop policy if exists "Owners remove character spells" on public.character_spells;
create policy "Owners remove character spells"
  on public.character_spells for delete to authenticated
  using (public.owns_character(character_id));

-- ---------------------------------------------------------------
-- Actions
-- ---------------------------------------------------------------
create or replace function public.create_spell(p_name text, p_content jsonb)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_id uuid;
begin
  if auth.uid() is null then raise exception 'not_signed_in'; end if;
  insert into public.spells (owner_id, name) values (auth.uid(), trim(p_name)) returning id into v_id;
  insert into public.spell_versions (spell_id, status, content) values (v_id, 'draft', p_content);
  return v_id;
end;
$$;

create or replace function public.publish_spell(p_spell uuid)
returns integer
language plpgsql security definer set search_path = ''
as $$
declare
  v_draft uuid;
  v_next integer;
begin
  if not public.owns_spell(p_spell) then raise exception 'not_allowed'; end if;
  select id into v_draft from public.spell_versions
  where spell_id = p_spell and status = 'draft' for update;
  if v_draft is null then raise exception 'no_draft'; end if;
  select coalesce(max(version_number), 0) + 1 into v_next
  from public.spell_versions where spell_id = p_spell and status = 'published';
  update public.spell_versions
  set status = 'published', version_number = v_next, published_at = now()
  where id = v_draft;
  update public.spells set updated_at = now() where id = p_spell;
  return v_next;
end;
$$;

create or replace function public.start_spell_draft(p_spell uuid)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_draft uuid;
  v_content jsonb;
begin
  if not public.owns_spell(p_spell) then raise exception 'not_allowed'; end if;
  select id into v_draft from public.spell_versions where spell_id = p_spell and status = 'draft';
  if v_draft is not null then return v_draft; end if;
  select content into v_content from public.spell_versions
  where spell_id = p_spell and status = 'published'
  order by version_number desc limit 1;
  if v_content is null then raise exception 'no_versions'; end if;
  insert into public.spell_versions (spell_id, status, content)
  values (p_spell, 'draft', v_content) returning id into v_draft;
  return v_draft;
end;
$$;

create or replace function public.discard_spell_draft(p_spell uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not public.owns_spell(p_spell) then raise exception 'not_allowed'; end if;
  if not exists (select 1 from public.spell_versions where spell_id = p_spell and status = 'published') then
    raise exception 'only_draft';
  end if;
  delete from public.spell_versions where spell_id = p_spell and status = 'draft';
end;
$$;

create or replace function public.duplicate_spell(p_spell uuid)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_name text;
  v_content jsonb;
  v_id uuid;
begin
  if not public.owns_spell(p_spell) then raise exception 'not_allowed'; end if;
  select name into v_name from public.spells where id = p_spell;
  select content into v_content from public.spell_versions
  where spell_id = p_spell
  order by (status = 'draft') desc, version_number desc nulls last limit 1;
  insert into public.spells (owner_id, name) values (auth.uid(), left('Copy of ' || v_name, 80))
  returning id into v_id;
  insert into public.spell_versions (spell_id, status, content) values (v_id, 'draft', v_content);
  return v_id;
end;
$$;

create or replace function public.delete_spell(p_spell uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not public.owns_spell(p_spell) then raise exception 'not_allowed'; end if;
  if exists (
    select 1 from public.character_spells cs
    join public.spell_versions v on v.id = cs.spell_version_id
    where v.spell_id = p_spell
  ) then
    raise exception 'spell_in_use';
  end if;
  delete from public.spells where id = p_spell;
end;
$$;

create or replace function public.add_spell_to_character(p_character uuid, p_version uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not public.owns_character(p_character) then raise exception 'not_allowed'; end if;
  if exists (select 1 from public.spell_versions where id = p_version and status = 'draft') then
    raise exception 'not_published';
  end if;
  if not public.can_use_spell_version(p_version, p_character) then raise exception 'spell_not_allowed'; end if;
  insert into public.character_spells (character_id, spell_version_id)
  values (p_character, p_version)
  on conflict do nothing;
end;
$$;

-- Accounts can't be deleted while other players' characters use their spells.
create or replace function public.delete_my_account()
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Not signed in';
  end if;
  if exists (select 1 from public.campaign_members
             where user_id = auth.uid() and role = 'owner') then
    raise exception 'owns_campaigns';
  end if;
  if exists (
    select 1 from public.characters ch
    join public.sheet_template_versions v on v.id = ch.template_version_id
    join public.sheet_templates t on t.id = v.template_id
    where t.owner_id = auth.uid() and ch.owner_id <> auth.uid()
  ) or exists (
    select 1 from public.character_spells cs
    join public.characters ch on ch.id = cs.character_id
    join public.spell_versions v on v.id = cs.spell_version_id
    join public.spells s on s.id = v.spell_id
    where s.owner_id = auth.uid() and ch.owner_id <> auth.uid()
  ) then
    raise exception 'templates_in_use';
  end if;
  delete from auth.users where id = auth.uid();
end;
$$;

revoke execute on function public.create_spell(text, jsonb) from public, anon;
revoke execute on function public.publish_spell(uuid) from public, anon;
revoke execute on function public.start_spell_draft(uuid) from public, anon;
revoke execute on function public.discard_spell_draft(uuid) from public, anon;
revoke execute on function public.duplicate_spell(uuid) from public, anon;
revoke execute on function public.delete_spell(uuid) from public, anon;
revoke execute on function public.add_spell_to_character(uuid, uuid) from public, anon;
revoke execute on function public.delete_my_account() from public, anon;
grant execute on function public.create_spell(text, jsonb) to authenticated;
grant execute on function public.publish_spell(uuid) to authenticated;
grant execute on function public.start_spell_draft(uuid) to authenticated;
grant execute on function public.discard_spell_draft(uuid) to authenticated;
grant execute on function public.duplicate_spell(uuid) to authenticated;
grant execute on function public.delete_spell(uuid) to authenticated;
grant execute on function public.add_spell_to_character(uuid, uuid) to authenticated;
grant execute on function public.delete_my_account() to authenticated;
