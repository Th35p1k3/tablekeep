-- 0006: inventory, templates offered by campaigns, characters in campaigns,
-- and who can see which character sheets.
-- Run once in Supabase -> SQL Editor (New query). Safe to re-run.

-- ---------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------
alter table public.campaigns
  add column if not exists players_see_full_sheets boolean not null default false;
grant update (players_see_full_sheets) on public.campaigns to authenticated;

create table if not exists public.inventory_items (
  id uuid primary key default gen_random_uuid(),
  character_id uuid not null references public.characters (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  quantity integer not null default 1 check (quantity between 0 and 1000000),
  weight numeric(10, 2) check (weight is null or (weight >= 0 and weight <= 100000)),
  notes text not null default '' check (char_length(notes) <= 500),
  created_at timestamptz not null default now()
);
create index if not exists inventory_items_character_idx
  on public.inventory_items (character_id, created_at);

create table if not exists public.campaign_templates (
  campaign_id uuid not null references public.campaigns (id) on delete cascade,
  template_version_id uuid not null references public.sheet_template_versions (id) on delete cascade,
  added_by uuid references auth.users (id) on delete set null,
  added_at timestamptz not null default now(),
  primary key (campaign_id, template_version_id)
);

create table if not exists public.campaign_characters (
  campaign_id uuid not null references public.campaigns (id) on delete cascade,
  -- unique: a character is in at most one campaign at a time
  character_id uuid not null unique references public.characters (id) on delete cascade,
  added_at timestamptz not null default now(),
  primary key (campaign_id, character_id)
);

alter table public.inventory_items enable row level security;
alter table public.campaign_templates enable row level security;
alter table public.campaign_characters enable row level security;
revoke all on public.inventory_items from anon, authenticated;
revoke all on public.campaign_templates from anon, authenticated;
revoke all on public.campaign_characters from anon, authenticated;

-- ---------------------------------------------------------------
-- Who can see what
-- ---------------------------------------------------------------

-- Owner always; the campaign's DM and Co-DMs; other players only when the
-- campaign allows full sheets.
create or replace function public.can_view_character(p_character uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.characters ch
    where ch.id = p_character and ch.owner_id = auth.uid()
  ) or exists (
    select 1
    from public.campaign_characters cc
    join public.campaigns c on c.id = cc.campaign_id
    where cc.character_id = p_character
      and (
        public.is_campaign_manager(cc.campaign_id)
        or (c.players_see_full_sheets and public.is_campaign_member(cc.campaign_id))
      )
  );
$$;

-- A template version is readable by its owner, by members of a campaign
-- that offers it, and by anyone who can see a character built from it.
create or replace function public.can_read_template_version(p_version uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1
    from public.sheet_template_versions v
    join public.sheet_templates t on t.id = v.template_id
    where v.id = p_version and t.owner_id = auth.uid()
  ) or exists (
    select 1 from public.campaign_templates ct
    where ct.template_version_id = p_version and public.is_campaign_member(ct.campaign_id)
  ) or exists (
    select 1 from public.characters ch
    where ch.template_version_id = p_version and public.can_view_character(ch.id)
  );
$$;

create or replace function public.can_read_template(p_template uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.sheet_template_versions v
    where v.template_id = p_template
      and v.status = 'published'
      and public.can_read_template_version(v.id)
  );
$$;

-- Building characters: from your own published versions, or from versions
-- a campaign you belong to offers.
create or replace function public.can_use_template_version(p_version uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1
    from public.sheet_template_versions v
    join public.sheet_templates t on t.id = v.template_id
    where v.id = p_version and v.status = 'published' and t.owner_id = auth.uid()
  ) or exists (
    select 1
    from public.campaign_templates ct
    join public.sheet_template_versions v on v.id = ct.template_version_id
    where ct.template_version_id = p_version
      and v.status = 'published'
      and public.is_campaign_member(ct.campaign_id)
  );
$$;

revoke execute on function public.can_view_character(uuid) from public, anon;
revoke execute on function public.can_read_template_version(uuid) from public, anon;
revoke execute on function public.can_read_template(uuid) from public, anon;
grant execute on function public.can_view_character(uuid) to authenticated;
grant execute on function public.can_read_template_version(uuid) to authenticated;
grant execute on function public.can_read_template(uuid) to authenticated;

drop policy if exists "Campaign viewers see party characters" on public.characters;
create policy "Campaign viewers see party characters"
  on public.characters for select to authenticated
  using (public.can_view_character(id));

drop policy if exists "Shared template versions are readable" on public.sheet_template_versions;
create policy "Shared template versions are readable"
  on public.sheet_template_versions for select to authenticated
  using (status = 'published' and public.can_read_template_version(id));

drop policy if exists "Shared templates are readable" on public.sheet_templates;
create policy "Shared templates are readable"
  on public.sheet_templates for select to authenticated
  using (public.can_read_template(id));

-- Inventory: visible like the character, editable only by its owner.
grant select on public.inventory_items to authenticated;
grant insert (character_id, name, quantity, weight, notes) on public.inventory_items to authenticated;
grant update (name, quantity, weight, notes) on public.inventory_items to authenticated;
grant delete on public.inventory_items to authenticated;

drop policy if exists "Inventory visible with the character" on public.inventory_items;
create policy "Inventory visible with the character"
  on public.inventory_items for select to authenticated
  using (public.can_view_character(character_id));

drop policy if exists "Owners add inventory" on public.inventory_items;
create policy "Owners add inventory"
  on public.inventory_items for insert to authenticated
  with check (public.owns_character(character_id));

drop policy if exists "Owners edit inventory" on public.inventory_items;
create policy "Owners edit inventory"
  on public.inventory_items for update to authenticated
  using (public.owns_character(character_id))
  with check (public.owns_character(character_id));

drop policy if exists "Owners remove inventory" on public.inventory_items;
create policy "Owners remove inventory"
  on public.inventory_items for delete to authenticated
  using (public.owns_character(character_id));

grant select on public.campaign_templates to authenticated;
drop policy if exists "Members see offered templates" on public.campaign_templates;
create policy "Members see offered templates"
  on public.campaign_templates for select to authenticated
  using (public.is_campaign_member(campaign_id));

grant select on public.campaign_characters to authenticated;
drop policy if exists "Members see the party" on public.campaign_characters;
create policy "Members see the party"
  on public.campaign_characters for select to authenticated
  using (public.is_campaign_member(campaign_id) or public.owns_character(character_id));

-- ---------------------------------------------------------------
-- Actions
-- ---------------------------------------------------------------
create or replace function public.offer_template_in_campaign(p_campaign uuid, p_version uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not public.is_campaign_manager(p_campaign) then raise exception 'not_allowed'; end if;
  if not exists (
    select 1 from public.sheet_template_versions v
    join public.sheet_templates t on t.id = v.template_id
    where v.id = p_version and v.status = 'published' and t.owner_id = auth.uid()
  ) then
    raise exception 'not_your_template';
  end if;
  insert into public.campaign_templates (campaign_id, template_version_id, added_by)
  values (p_campaign, p_version, auth.uid())
  on conflict do nothing;
end;
$$;

create or replace function public.withdraw_template_from_campaign(p_campaign uuid, p_version uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not public.is_campaign_manager(p_campaign) then raise exception 'not_allowed'; end if;
  delete from public.campaign_templates
  where campaign_id = p_campaign and template_version_id = p_version;
end;
$$;

create or replace function public.add_character_to_campaign(p_campaign uuid, p_character uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not public.owns_character(p_character) then raise exception 'not_allowed'; end if;
  if not public.is_campaign_member(p_campaign) then raise exception 'not_allowed'; end if;
  if exists (select 1 from public.campaigns where id = p_campaign and status = 'archived') then
    raise exception 'campaign_archived';
  end if;
  if exists (select 1 from public.campaign_characters where character_id = p_character) then
    raise exception 'character_in_campaign';
  end if;
  insert into public.campaign_characters (campaign_id, character_id)
  values (p_campaign, p_character);
end;
$$;

create or replace function public.remove_character_from_campaign(p_campaign uuid, p_character uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not (public.owns_character(p_character) or public.is_campaign_manager(p_campaign)) then
    raise exception 'not_allowed';
  end if;
  delete from public.campaign_characters
  where campaign_id = p_campaign and character_id = p_character;
end;
$$;

-- The party list every member may see: names only, plus whether you may
-- open each sheet.
create or replace function public.campaign_party(p_campaign uuid)
returns table (
  character_id uuid,
  character_name text,
  owner_id uuid,
  owner_name text,
  template_name text,
  version_number integer,
  can_view boolean
)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not public.is_campaign_member(p_campaign) then raise exception 'not_allowed'; end if;
  return query
    select ch.id, ch.name, ch.owner_id, coalesce(p.display_name, 'Unknown player'),
           t.name, v.version_number, public.can_view_character(ch.id)
    from public.campaign_characters cc
    join public.characters ch on ch.id = cc.character_id
    join public.sheet_template_versions v on v.id = ch.template_version_id
    join public.sheet_templates t on t.id = v.template_id
    left join public.profiles p on p.id = ch.owner_id
    where cc.campaign_id = p_campaign
    order by ch.name;
end;
$$;

-- When someone leaves or is removed, their characters leave the party too.
create or replace function public.campaign_members_after_delete()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  delete from public.campaign_characters cc
  using public.characters ch
  where cc.character_id = ch.id
    and cc.campaign_id = old.campaign_id
    and ch.owner_id = old.user_id;
  return old;
end;
$$;

drop trigger if exists campaign_members_after_delete on public.campaign_members;
create trigger campaign_members_after_delete
  after delete on public.campaign_members
  for each row execute function public.campaign_members_after_delete();

-- Accounts can't be deleted while other players' characters use their templates.
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
  ) then
    raise exception 'templates_in_use';
  end if;
  delete from auth.users where id = auth.uid();
end;
$$;

revoke execute on function public.offer_template_in_campaign(uuid, uuid) from public, anon;
revoke execute on function public.withdraw_template_from_campaign(uuid, uuid) from public, anon;
revoke execute on function public.add_character_to_campaign(uuid, uuid) from public, anon;
revoke execute on function public.remove_character_from_campaign(uuid, uuid) from public, anon;
revoke execute on function public.campaign_party(uuid) from public, anon;
revoke execute on function public.delete_my_account() from public, anon;
grant execute on function public.offer_template_in_campaign(uuid, uuid) to authenticated;
grant execute on function public.withdraw_template_from_campaign(uuid, uuid) to authenticated;
grant execute on function public.add_character_to_campaign(uuid, uuid) to authenticated;
grant execute on function public.remove_character_from_campaign(uuid, uuid) to authenticated;
grant execute on function public.campaign_party(uuid) to authenticated;
grant execute on function public.delete_my_account() to authenticated;
