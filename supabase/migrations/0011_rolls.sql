-- 0011: fair dice rolls and DM roll requests.
-- Run once in Supabase -> SQL Editor (New query). Safe to re-run.

create table if not exists public.roll_requests (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns (id) on delete cascade,
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  label text not null check (char_length(label) between 1 and 60),
  dice_count integer not null check (dice_count between 1 and 20),
  dice_sides integer not null check (dice_sides between 2 and 100),
  bonus integer not null default 0 check (bonus between -100 and 100),
  modifier_field text check (modifier_field is null or modifier_field ~ '^[a-z][a-z0-9_]{0,39}$'),
  keep text not null default 'normal' check (keep in ('normal', 'highest', 'lowest')),
  share_results boolean not null default false,
  status text not null default 'open' check (status in ('open', 'closed')),
  created_at timestamptz not null default now()
);
create index if not exists roll_requests_campaign_idx on public.roll_requests (campaign_id, created_at desc);

create table if not exists public.roll_request_targets (
  request_id uuid not null references public.roll_requests (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  primary key (request_id, user_id)
);

create table if not exists public.roll_results (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.roll_requests (id) on delete cascade,
  campaign_id uuid not null references public.campaigns (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  character_id uuid references public.characters (id) on delete set null,
  method text not null check (method in ('app', 'manual')),
  dice integer[],
  dice_other integer[],
  modifier integer not null default 0,
  modifier_label text not null default '' check (char_length(modifier_label) <= 80),
  total integer not null,
  created_at timestamptz not null default now(),
  unique (request_id, user_id)
);
create index if not exists roll_results_campaign_idx on public.roll_results (campaign_id, created_at desc);

alter table public.roll_requests enable row level security;
alter table public.roll_request_targets enable row level security;
alter table public.roll_results enable row level security;
revoke all on public.roll_requests from anon, authenticated;
revoke all on public.roll_request_targets from anon, authenticated;
revoke all on public.roll_results from anon, authenticated;

create or replace function public.is_roll_target(p_request uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.roll_request_targets where request_id = p_request and user_id = auth.uid());
$$;
revoke execute on function public.is_roll_target(uuid) from public, anon;
grant execute on function public.is_roll_target(uuid) to authenticated;

-- Requests: DMs see all of their campaign's; players see the ones aimed at them.
grant select on public.roll_requests to authenticated;
drop policy if exists "See roll requests" on public.roll_requests;
create policy "See roll requests" on public.roll_requests for select to authenticated
  using (public.is_campaign_manager(campaign_id) or (public.is_roll_target(id) and public.is_campaign_member(campaign_id)));

grant select on public.roll_request_targets to authenticated;
drop policy if exists "See roll targets" on public.roll_request_targets;
create policy "See roll targets" on public.roll_request_targets for select to authenticated
  using (
    user_id = (select auth.uid())
    or exists (select 1 from public.roll_requests r where r.id = request_id and public.is_campaign_manager(r.campaign_id))
  );

-- Results: DMs and the person who rolled. (Shared results go to chat.)
grant select on public.roll_results to authenticated;
drop policy if exists "See roll results" on public.roll_results;
create policy "See roll results" on public.roll_results for select to authenticated
  using (user_id = (select auth.uid()) or public.is_campaign_manager(campaign_id));

-- A fair die: secure random bytes, so nobody can predict or replay a roll.
create or replace function public.roll_die(p_sides integer)
returns integer
language sql volatile
set search_path = ''
as $$
  select (('x' || encode(extensions.gen_random_bytes(4), 'hex'))::bit(32)::bigint % p_sides)::integer + 1;
$$;
revoke execute on function public.roll_die(integer) from public, anon, authenticated;

create or replace function public.create_roll_request(
  p_campaign uuid, p_label text, p_count integer, p_sides integer, p_bonus integer,
  p_modifier_field text, p_keep text, p_share boolean, p_targets uuid[]
)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_id uuid;
begin
  if not public.is_campaign_manager(p_campaign) then raise exception 'not_allowed'; end if;
  if p_targets is null or cardinality(p_targets) = 0 then raise exception 'no_targets'; end if;
  if exists (
    select 1 from unnest(p_targets) t(id)
    where not exists (select 1 from public.campaign_members m where m.campaign_id = p_campaign and m.user_id = t.id)
  ) then raise exception 'not_a_member'; end if;

  insert into public.roll_requests (campaign_id, created_by, label, dice_count, dice_sides, bonus, modifier_field, keep, share_results)
  values (p_campaign, auth.uid(), trim(p_label), p_count, p_sides, coalesce(p_bonus, 0),
          nullif(trim(coalesce(p_modifier_field, '')), ''), coalesce(p_keep, 'normal'), coalesce(p_share, false))
  returning id into v_id;
  insert into public.roll_request_targets (request_id, user_id)
  select v_id, t.id from (select distinct unnest(p_targets) as id) t;
  return v_id;
end;
$$;

-- Shared results become a chat message from the roller.
create or replace function public.post_roll_to_chat(p_request public.roll_requests, p_text text)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if p_request.share_results then
    insert into public.messages (campaign_id, author_id, body)
    values (p_request.campaign_id, auth.uid(), left(p_text, 2000));
  end if;
end;
$$;
revoke execute on function public.post_roll_to_chat(public.roll_requests, text) from public, anon, authenticated;

create or replace function public.roll_for_request(
  p_request uuid, p_modifier integer default 0, p_modifier_label text default '', p_character uuid default null
)
returns public.roll_results
language plpgsql security definer set search_path = ''
as $$
declare
  r public.roll_requests;
  v_dice integer[] := '{}';
  v_other integer[];
  v_kept integer;
  v_other_sum integer;
  v_result public.roll_results;
  i integer;
begin
  select * into r from public.roll_requests where id = p_request;
  if r.id is null or not public.is_roll_target(p_request) or not public.is_campaign_member(r.campaign_id) then
    raise exception 'not_allowed';
  end if;
  if r.status <> 'open' then raise exception 'request_closed'; end if;
  if exists (select 1 from public.roll_results where request_id = p_request and user_id = auth.uid()) then
    raise exception 'already_rolled';
  end if;
  if p_modifier is null or p_modifier not between -100 and 100 then raise exception 'invalid_input'; end if;
  if p_character is not null and not exists (
    select 1 from public.characters ch
    join public.campaign_characters cc on cc.character_id = ch.id
    where ch.id = p_character and ch.owner_id = auth.uid() and cc.campaign_id = r.campaign_id
  ) then raise exception 'not_allowed'; end if;

  for i in 1..r.dice_count loop
    v_dice := v_dice || public.roll_die(r.dice_sides);
  end loop;
  v_kept := (select sum(x) from unnest(v_dice) x);

  if r.keep <> 'normal' then
    v_other := '{}';
    for i in 1..r.dice_count loop
      v_other := v_other || public.roll_die(r.dice_sides);
    end loop;
    v_other_sum := (select sum(x) from unnest(v_other) x);
    if (r.keep = 'highest' and v_other_sum > v_kept) or (r.keep = 'lowest' and v_other_sum < v_kept) then
      -- Keep the second set; store the first as the "other" roll.
      select v_other, v_dice into v_dice, v_other;
      v_kept := v_other_sum;
    end if;
  end if;

  insert into public.roll_results
    (request_id, campaign_id, user_id, character_id, method, dice, dice_other, modifier, modifier_label, total)
  values
    (p_request, r.campaign_id, auth.uid(), p_character, 'app', v_dice, v_other, p_modifier,
     left(coalesce(p_modifier_label, ''), 80), v_kept + r.bonus + p_modifier)
  returning * into v_result;

  perform public.post_roll_to_chat(
    r,
    format('🎲 %s: %s (rolled %s%s%s)', r.label, v_result.total, array_to_string(v_dice, ' + '),
      case when r.bonus <> 0 then format(' %s %s', case when r.bonus > 0 then '+' else '-' end, abs(r.bonus)) else '' end,
      case when p_modifier <> 0 then format(' %s %s %s', case when p_modifier > 0 then '+' else '-' end, abs(p_modifier),
        nullif(left(coalesce(p_modifier_label, ''), 40), '')) else '' end)
  );
  return v_result;
end;
$$;

create or replace function public.submit_manual_roll(p_request uuid, p_total integer)
returns public.roll_results
language plpgsql security definer set search_path = ''
as $$
declare
  r public.roll_requests;
  v_result public.roll_results;
begin
  select * into r from public.roll_requests where id = p_request;
  if r.id is null or not public.is_roll_target(p_request) or not public.is_campaign_member(r.campaign_id) then
    raise exception 'not_allowed';
  end if;
  if r.status <> 'open' then raise exception 'request_closed'; end if;
  if exists (select 1 from public.roll_results where request_id = p_request and user_id = auth.uid()) then
    raise exception 'already_rolled';
  end if;
  if p_total is null or p_total not between -1000 and 10000 then raise exception 'invalid_input'; end if;

  insert into public.roll_results (request_id, campaign_id, user_id, method, total)
  values (p_request, r.campaign_id, auth.uid(), 'manual', p_total)
  returning * into v_result;
  perform public.post_roll_to_chat(r, format('🎲 %s: %s (rolled at the table)', r.label, p_total));
  return v_result;
end;
$$;

create or replace function public.close_roll_request(p_request uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_campaign uuid;
begin
  select campaign_id into v_campaign from public.roll_requests where id = p_request;
  if v_campaign is null or not public.is_campaign_manager(v_campaign) then raise exception 'not_allowed'; end if;
  update public.roll_requests set status = 'closed' where id = p_request;
end;
$$;

revoke execute on function public.create_roll_request(uuid, text, integer, integer, integer, text, text, boolean, uuid[]) from public, anon;
revoke execute on function public.roll_for_request(uuid, integer, text, uuid) from public, anon;
revoke execute on function public.submit_manual_roll(uuid, integer) from public, anon;
revoke execute on function public.close_roll_request(uuid) from public, anon;
grant execute on function public.create_roll_request(uuid, text, integer, integer, integer, text, text, boolean, uuid[]) to authenticated;
grant execute on function public.roll_for_request(uuid, integer, text, uuid) to authenticated;
grant execute on function public.submit_manual_roll(uuid, integer) to authenticated;
grant execute on function public.close_roll_request(uuid) to authenticated;

-- Live updates for requests and results (the read rules above still apply).
do $$
declare
  t text;
begin
  foreach t in array array['roll_requests', 'roll_results'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
