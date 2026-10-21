-- 0004: character sheet templates with drafts and frozen published versions.
-- Run once in Supabase -> SQL Editor (New query). Safe to re-run.

create table if not exists public.sheet_templates (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  game_system text not null default '' check (char_length(game_system) <= 60),
  description text not null default '' check (char_length(description) <= 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists sheet_templates_owner_idx on public.sheet_templates (owner_id);

create table if not exists public.sheet_template_versions (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.sheet_templates (id) on delete cascade,
  status text not null check (status in ('draft', 'published')),
  version_number integer,
  definition jsonb not null
    check (jsonb_typeof(definition) = 'object' and octet_length(definition::text) < 262144),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  published_at timestamptz,
  check (
    (status = 'draft' and version_number is null and published_at is null)
    or (status = 'published' and version_number >= 1 and published_at is not null)
  ),
  unique (template_id, version_number)
);
create unique index if not exists sheet_template_versions_one_draft
  on public.sheet_template_versions (template_id) where status = 'draft';

alter table public.sheet_templates enable row level security;
alter table public.sheet_template_versions enable row level security;
revoke all on public.sheet_templates from anon, authenticated;
revoke all on public.sheet_template_versions from anon, authenticated;

-- Published versions are frozen forever; drafts get a fresh "updated" time.
create or replace function public.sheet_template_versions_guard()
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

drop trigger if exists sheet_template_versions_guard on public.sheet_template_versions;
create trigger sheet_template_versions_guard
  before update on public.sheet_template_versions
  for each row execute function public.sheet_template_versions_guard();

create or replace function public.owns_template(p_template uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.sheet_templates
    where id = p_template and owner_id = auth.uid()
  );
$$;
revoke execute on function public.owns_template(uuid) from public, anon;
grant execute on function public.owns_template(uuid) to authenticated;

-- Owners read and rename their own templates.
grant select on public.sheet_templates to authenticated;
grant update (name, game_system, description) on public.sheet_templates to authenticated;

drop policy if exists "Owners see their templates" on public.sheet_templates;
create policy "Owners see their templates"
  on public.sheet_templates for select to authenticated
  using (owner_id = (select auth.uid()));

drop policy if exists "Owners edit their templates" on public.sheet_templates;
create policy "Owners edit their templates"
  on public.sheet_templates for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

-- Owners read every version, but can only edit the draft's definition.
grant select on public.sheet_template_versions to authenticated;
grant update (definition) on public.sheet_template_versions to authenticated;

drop policy if exists "Owners see their template versions" on public.sheet_template_versions;
create policy "Owners see their template versions"
  on public.sheet_template_versions for select to authenticated
  using (public.owns_template(template_id));

drop policy if exists "Owners edit their drafts" on public.sheet_template_versions;
create policy "Owners edit their drafts"
  on public.sheet_template_versions for update to authenticated
  using (status = 'draft' and public.owns_template(template_id))
  with check (status = 'draft' and public.owns_template(template_id));

-- ---------------------------------------------------------------
-- Actions
-- ---------------------------------------------------------------
create or replace function public.create_template(
  p_name text, p_game_system text, p_description text, p_definition jsonb
)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_id uuid;
begin
  if auth.uid() is null then raise exception 'not_signed_in'; end if;
  insert into public.sheet_templates (owner_id, name, game_system, description)
  values (auth.uid(), trim(p_name), trim(coalesce(p_game_system, '')), trim(coalesce(p_description, '')))
  returning id into v_id;
  insert into public.sheet_template_versions (template_id, status, definition)
  values (v_id, 'draft', p_definition);
  return v_id;
end;
$$;

create or replace function public.publish_template(p_template uuid)
returns integer
language plpgsql security definer set search_path = ''
as $$
declare
  v_draft uuid;
  v_next integer;
begin
  if not public.owns_template(p_template) then raise exception 'not_allowed'; end if;
  select id into v_draft from public.sheet_template_versions
  where template_id = p_template and status = 'draft'
  for update;
  if v_draft is null then raise exception 'no_draft'; end if;

  select coalesce(max(version_number), 0) + 1 into v_next
  from public.sheet_template_versions
  where template_id = p_template and status = 'published';

  update public.sheet_template_versions
  set status = 'published', version_number = v_next, published_at = now()
  where id = v_draft;
  update public.sheet_templates set updated_at = now() where id = p_template;
  return v_next;
end;
$$;

-- Returns the draft, creating one from the latest published version if needed.
create or replace function public.start_template_draft(p_template uuid)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_draft uuid;
  v_definition jsonb;
begin
  if not public.owns_template(p_template) then raise exception 'not_allowed'; end if;
  select id into v_draft from public.sheet_template_versions
  where template_id = p_template and status = 'draft';
  if v_draft is not null then return v_draft; end if;

  select definition into v_definition from public.sheet_template_versions
  where template_id = p_template and status = 'published'
  order by version_number desc limit 1;
  if v_definition is null then raise exception 'no_versions'; end if;

  insert into public.sheet_template_versions (template_id, status, definition)
  values (p_template, 'draft', v_definition)
  returning id into v_draft;
  return v_draft;
end;
$$;

create or replace function public.discard_template_draft(p_template uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not public.owns_template(p_template) then raise exception 'not_allowed'; end if;
  if not exists (select 1 from public.sheet_template_versions
                 where template_id = p_template and status = 'published') then
    raise exception 'only_draft';
  end if;
  delete from public.sheet_template_versions
  where template_id = p_template and status = 'draft';
end;
$$;

create or replace function public.duplicate_template(p_template uuid)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_source public.sheet_templates;
  v_definition jsonb;
  v_id uuid;
begin
  if not public.owns_template(p_template) then raise exception 'not_allowed'; end if;
  select * into v_source from public.sheet_templates where id = p_template;
  select definition into v_definition from public.sheet_template_versions
  where template_id = p_template
  order by (status = 'draft') desc, version_number desc nulls last
  limit 1;

  insert into public.sheet_templates (owner_id, name, game_system, description)
  values (auth.uid(), left('Copy of ' || v_source.name, 80), v_source.game_system, v_source.description)
  returning id into v_id;
  insert into public.sheet_template_versions (template_id, status, definition)
  values (v_id, 'draft', v_definition);
  return v_id;
end;
$$;

create or replace function public.delete_template(p_template uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not public.owns_template(p_template) then raise exception 'not_allowed'; end if;
  delete from public.sheet_templates where id = p_template;
end;
$$;

revoke execute on function public.create_template(text, text, text, jsonb) from public, anon;
revoke execute on function public.publish_template(uuid) from public, anon;
revoke execute on function public.start_template_draft(uuid) from public, anon;
revoke execute on function public.discard_template_draft(uuid) from public, anon;
revoke execute on function public.duplicate_template(uuid) from public, anon;
revoke execute on function public.delete_template(uuid) from public, anon;
grant execute on function public.create_template(text, text, text, jsonb) to authenticated;
grant execute on function public.publish_template(uuid) to authenticated;
grant execute on function public.start_template_draft(uuid) to authenticated;
grant execute on function public.discard_template_draft(uuid) to authenticated;
grant execute on function public.duplicate_template(uuid) to authenticated;
grant execute on function public.delete_template(uuid) to authenticated;
