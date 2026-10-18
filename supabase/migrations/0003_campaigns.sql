-- 0003: campaigns, memberships and invite links.
-- Run once in Supabase -> SQL Editor (New query). Safe to re-run.

create extension if not exists pgcrypto with schema extensions;

do $$ begin
  create type public.campaign_role as enum ('owner', 'co_dm', 'player');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------
create table if not exists public.campaigns (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 80),
  game_system text not null default '' check (char_length(game_system) <= 60),
  description text not null default '' check (char_length(description) <= 2000),
  status text not null default 'active' check (status in ('active', 'archived')),
  created_at timestamptz not null default now()
);

create table if not exists public.campaign_members (
  campaign_id uuid not null references public.campaigns (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role public.campaign_role not null default 'player',
  joined_at timestamptz not null default now(),
  primary key (campaign_id, user_id)
);
create unique index if not exists campaign_members_one_owner
  on public.campaign_members (campaign_id) where role = 'owner';
create index if not exists campaign_members_user_idx
  on public.campaign_members (user_id);

create table if not exists public.campaign_invites (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns (id) on delete cascade,
  token_hash text not null unique,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  max_uses integer not null check (max_uses between 1 and 100),
  uses integer not null default 0,
  revoked_at timestamptz
);
create index if not exists campaign_invites_campaign_idx
  on public.campaign_invites (campaign_id);

alter table public.campaigns enable row level security;
alter table public.campaign_members enable row level security;
alter table public.campaign_invites enable row level security;

revoke all on public.campaigns from anon, authenticated;
revoke all on public.campaign_members from anon, authenticated;
revoke all on public.campaign_invites from anon, authenticated;

-- ---------------------------------------------------------------
-- Helper checks used by the security rules
-- ---------------------------------------------------------------
create or replace function public.my_campaign_role(p_campaign uuid)
returns public.campaign_role
language sql stable security definer set search_path = ''
as $$
  select m.role from public.campaign_members m
  where m.campaign_id = p_campaign and m.user_id = auth.uid();
$$;

create or replace function public.is_campaign_member(p_campaign uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select public.my_campaign_role(p_campaign) is not null;
$$;

create or replace function public.is_campaign_manager(p_campaign uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce(public.my_campaign_role(p_campaign) in ('owner', 'co_dm'), false);
$$;

create or replace function public.shares_campaign_with(p_user uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1
    from public.campaign_members me
    join public.campaign_members them on them.campaign_id = me.campaign_id
    where me.user_id = auth.uid() and them.user_id = p_user
  );
$$;

revoke execute on function public.my_campaign_role(uuid) from public, anon;
revoke execute on function public.is_campaign_member(uuid) from public, anon;
revoke execute on function public.is_campaign_manager(uuid) from public, anon;
revoke execute on function public.shares_campaign_with(uuid) from public, anon;
grant execute on function public.my_campaign_role(uuid) to authenticated;
grant execute on function public.is_campaign_member(uuid) to authenticated;
grant execute on function public.is_campaign_manager(uuid) to authenticated;
grant execute on function public.shares_campaign_with(uuid) to authenticated;

-- ---------------------------------------------------------------
-- Security rules (Row Level Security)
-- ---------------------------------------------------------------
grant select on public.campaigns to authenticated;
grant update (name, game_system, description, status) on public.campaigns to authenticated;

drop policy if exists "Members see their campaigns" on public.campaigns;
create policy "Members see their campaigns"
  on public.campaigns for select to authenticated
  using (public.is_campaign_member(id));

drop policy if exists "Managers edit their campaigns" on public.campaigns;
create policy "Managers edit their campaigns"
  on public.campaigns for update to authenticated
  using (public.is_campaign_manager(id))
  with check (public.is_campaign_manager(id));

grant select on public.campaign_members to authenticated;

drop policy if exists "Members see fellow members" on public.campaign_members;
create policy "Members see fellow members"
  on public.campaign_members for select to authenticated
  using (public.is_campaign_member(campaign_id));

-- The token hash is deliberately not readable by anyone.
grant select (id, campaign_id, created_by, created_at, expires_at, max_uses, uses, revoked_at)
  on public.campaign_invites to authenticated;

drop policy if exists "Managers see invite links" on public.campaign_invites;
create policy "Managers see invite links"
  on public.campaign_invites for select to authenticated
  using (public.is_campaign_manager(campaign_id));

drop policy if exists "Members read fellow members' profiles" on public.profiles;
create policy "Members read fellow members' profiles"
  on public.profiles for select to authenticated
  using (public.shares_campaign_with(id));

-- ---------------------------------------------------------------
-- Actions. All membership changes go through these functions, which
-- check permissions first. Errors are short codes the app translates.
-- ---------------------------------------------------------------
create or replace function public.create_campaign(
  p_name text, p_game_system text default '', p_description text default ''
)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_id uuid;
begin
  if v_uid is null then raise exception 'not_signed_in'; end if;
  insert into public.campaigns (name, game_system, description)
  values (trim(p_name), trim(coalesce(p_game_system, '')), trim(coalesce(p_description, '')))
  returning id into v_id;
  insert into public.campaign_members (campaign_id, user_id, role)
  values (v_id, v_uid, 'owner');
  return v_id;
end;
$$;

create or replace function public.delete_campaign(p_campaign uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if public.my_campaign_role(p_campaign) is distinct from 'owner' then
    raise exception 'not_allowed';
  end if;
  delete from public.campaigns where id = p_campaign;
end;
$$;

create or replace function public.create_invite(
  p_campaign uuid, p_days integer default 7, p_max_uses integer default 10
)
returns text
language plpgsql security definer set search_path = ''
as $$
declare
  v_token text;
begin
  if not public.is_campaign_manager(p_campaign) then
    raise exception 'not_allowed';
  end if;
  if p_days is null or p_days not between 1 and 30
     or p_max_uses is null or p_max_uses not between 1 and 100 then
    raise exception 'invalid_input';
  end if;
  if exists (select 1 from public.campaigns
             where id = p_campaign and status = 'archived') then
    raise exception 'campaign_archived';
  end if;

  v_token := encode(extensions.gen_random_bytes(24), 'hex');
  insert into public.campaign_invites
    (campaign_id, token_hash, created_by, expires_at, max_uses)
  values (
    p_campaign,
    encode(extensions.digest(v_token, 'sha256'), 'hex'),
    auth.uid(),
    now() + make_interval(days => p_days),
    p_max_uses
  );
  return v_token;
end;
$$;

create or replace function public.revoke_invite(p_invite uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_campaign uuid;
begin
  select campaign_id into v_campaign
  from public.campaign_invites where id = p_invite;
  if v_campaign is null or not public.is_campaign_manager(v_campaign) then
    raise exception 'not_allowed';
  end if;
  update public.campaign_invites
  set revoked_at = now()
  where id = p_invite and revoked_at is null;
end;
$$;

create or replace function public.preview_invite(p_token text)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v public.campaign_invites;
  v_campaign public.campaigns;
  v_dm text;
  v_state text;
begin
  select * into v from public.campaign_invites
  where token_hash = encode(extensions.digest(coalesce(p_token, ''), 'sha256'), 'hex');
  if not found then
    return jsonb_build_object('state', 'invalid');
  end if;

  select * into v_campaign from public.campaigns where id = v.campaign_id;
  select p.display_name into v_dm
  from public.campaign_members m
  join public.profiles p on p.id = m.user_id
  where m.campaign_id = v.campaign_id and m.role = 'owner';

  v_state := case
    when auth.uid() is not null and exists (
      select 1 from public.campaign_members
      where campaign_id = v.campaign_id and user_id = auth.uid()
    ) then 'already_member'
    when v.revoked_at is not null then 'revoked'
    when v.expires_at <= now() then 'expired'
    when v.uses >= v.max_uses then 'used_up'
    when v_campaign.status = 'archived' then 'archived'
    else 'ok'
  end;

  return jsonb_build_object(
    'state', v_state,
    'campaign_id', case when v_state = 'already_member' then v.campaign_id end,
    'campaign_name', v_campaign.name,
    'game_system', v_campaign.game_system,
    'dm_name', v_dm
  );
end;
$$;

create or replace function public.join_campaign(p_token text)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v public.campaign_invites;
  v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'not_signed_in'; end if;

  select * into v from public.campaign_invites
  where token_hash = encode(extensions.digest(coalesce(p_token, ''), 'sha256'), 'hex')
  for update;
  if not found then raise exception 'invite_invalid'; end if;

  if exists (select 1 from public.campaign_members
             where campaign_id = v.campaign_id and user_id = v_uid) then
    return v.campaign_id;
  end if;
  if v.revoked_at is not null then raise exception 'invite_revoked'; end if;
  if v.expires_at <= now() then raise exception 'invite_expired'; end if;
  if v.uses >= v.max_uses then raise exception 'invite_used_up'; end if;
  if exists (select 1 from public.campaigns
             where id = v.campaign_id and status = 'archived') then
    raise exception 'campaign_archived';
  end if;

  insert into public.campaign_members (campaign_id, user_id, role)
  values (v.campaign_id, v_uid, 'player');
  update public.campaign_invites set uses = uses + 1 where id = v.id;
  return v.campaign_id;
end;
$$;

create or replace function public.set_member_role(
  p_campaign uuid, p_user uuid, p_role public.campaign_role
)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_target public.campaign_role;
begin
  if public.my_campaign_role(p_campaign) is distinct from 'owner' then
    raise exception 'not_allowed';
  end if;
  if p_role = 'owner' then raise exception 'invalid_input'; end if;
  select role into v_target from public.campaign_members
  where campaign_id = p_campaign and user_id = p_user;
  if v_target is null then raise exception 'not_a_member'; end if;
  if v_target = 'owner' then raise exception 'not_allowed'; end if;
  update public.campaign_members set role = p_role
  where campaign_id = p_campaign and user_id = p_user;
end;
$$;

create or replace function public.remove_member(p_campaign uuid, p_user uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_me public.campaign_role := public.my_campaign_role(p_campaign);
  v_target public.campaign_role;
begin
  if p_user = auth.uid() then raise exception 'use_leave'; end if;
  select role into v_target from public.campaign_members
  where campaign_id = p_campaign and user_id = p_user;
  if v_target is null then raise exception 'not_a_member'; end if;
  if not (v_me = 'owner' or (v_me = 'co_dm' and v_target = 'player')) then
    raise exception 'not_allowed';
  end if;
  delete from public.campaign_members
  where campaign_id = p_campaign and user_id = p_user;
end;
$$;

create or replace function public.leave_campaign(p_campaign uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_me public.campaign_role := public.my_campaign_role(p_campaign);
begin
  if v_me is null then raise exception 'not_a_member'; end if;
  if v_me = 'owner' then raise exception 'owner_cannot_leave'; end if;
  delete from public.campaign_members
  where campaign_id = p_campaign and user_id = auth.uid();
end;
$$;

create or replace function public.transfer_ownership(p_campaign uuid, p_new_owner uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if public.my_campaign_role(p_campaign) is distinct from 'owner' then
    raise exception 'not_allowed';
  end if;
  if p_new_owner = auth.uid() or not exists (
    select 1 from public.campaign_members
    where campaign_id = p_campaign and user_id = p_new_owner
  ) then
    raise exception 'not_a_member';
  end if;
  -- Step down first: a campaign can only ever have one owner.
  update public.campaign_members set role = 'co_dm'
  where campaign_id = p_campaign and user_id = auth.uid();
  update public.campaign_members set role = 'owner'
  where campaign_id = p_campaign and user_id = p_new_owner;
end;
$$;

-- Owners must hand over or delete their campaigns before deleting
-- their account, so no campaign is ever left without an owner.
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
  delete from auth.users where id = auth.uid();
end;
$$;

revoke execute on function public.create_campaign(text, text, text) from public, anon;
revoke execute on function public.delete_campaign(uuid) from public, anon;
revoke execute on function public.create_invite(uuid, integer, integer) from public, anon;
revoke execute on function public.revoke_invite(uuid) from public, anon;
revoke execute on function public.preview_invite(text) from public;
revoke execute on function public.join_campaign(text) from public, anon;
revoke execute on function public.set_member_role(uuid, uuid, public.campaign_role) from public, anon;
revoke execute on function public.remove_member(uuid, uuid) from public, anon;
revoke execute on function public.leave_campaign(uuid) from public, anon;
revoke execute on function public.transfer_ownership(uuid, uuid) from public, anon;
revoke execute on function public.delete_my_account() from public, anon;

grant execute on function public.create_campaign(text, text, text) to authenticated;
grant execute on function public.delete_campaign(uuid) to authenticated;
grant execute on function public.create_invite(uuid, integer, integer) to authenticated;
grant execute on function public.revoke_invite(uuid) to authenticated;
grant execute on function public.preview_invite(text) to anon, authenticated;
grant execute on function public.join_campaign(text) to authenticated;
grant execute on function public.set_member_role(uuid, uuid, public.campaign_role) to authenticated;
grant execute on function public.remove_member(uuid, uuid) to authenticated;
grant execute on function public.leave_campaign(uuid) to authenticated;
grant execute on function public.transfer_ownership(uuid, uuid) to authenticated;
grant execute on function public.delete_my_account() to authenticated;
