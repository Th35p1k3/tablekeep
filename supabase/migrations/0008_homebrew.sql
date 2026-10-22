-- 0008: homebrew submissions, the DM approval queue, campaign spell lists,
-- and the "approved spells only" rule for characters in campaigns.
-- Run once in Supabase -> SQL Editor (New query). Safe to re-run.

alter table public.campaigns
  add column if not exists spells_need_approval boolean not null default true;
grant update (spells_need_approval) on public.campaigns to authenticated;

create table if not exists public.campaign_spells (
  campaign_id uuid not null references public.campaigns (id) on delete cascade,
  spell_version_id uuid not null references public.spell_versions (id) on delete cascade,
  added_by uuid references auth.users (id) on delete set null,
  added_at timestamptz not null default now(),
  primary key (campaign_id, spell_version_id)
);

create table if not exists public.homebrew_submissions (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns (id) on delete cascade,
  content_type text not null check (content_type in ('spell', 'template')),
  spell_version_id uuid references public.spell_versions (id) on delete cascade,
  template_version_id uuid references public.sheet_template_versions (id) on delete cascade,
  submitted_by uuid not null references auth.users (id) on delete cascade,
  submitter_note text not null default '' check (char_length(submitter_note) <= 500),
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected', 'changes_requested')),
  review_note text not null default '' check (char_length(review_note) <= 1000),
  reviewed_by uuid references auth.users (id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  check (
    (content_type = 'spell' and spell_version_id is not null and template_version_id is null)
    or (content_type = 'template' and template_version_id is not null and spell_version_id is null)
  )
);
create index if not exists homebrew_submissions_campaign_idx
  on public.homebrew_submissions (campaign_id, status, created_at desc);
create unique index if not exists homebrew_one_pending_spell
  on public.homebrew_submissions (campaign_id, spell_version_id) where status = 'pending';
create unique index if not exists homebrew_one_pending_template
  on public.homebrew_submissions (campaign_id, template_version_id) where status = 'pending';

alter table public.campaign_spells enable row level security;
alter table public.homebrew_submissions enable row level security;
revoke all on public.campaign_spells from anon, authenticated;
revoke all on public.homebrew_submissions from anon, authenticated;

grant select on public.campaign_spells to authenticated;
drop policy if exists "Members see campaign spells" on public.campaign_spells;
create policy "Members see campaign spells"
  on public.campaign_spells for select to authenticated
  using (public.is_campaign_member(campaign_id));

grant select on public.homebrew_submissions to authenticated;
drop policy if exists "Submitters and managers see submissions" on public.homebrew_submissions;
create policy "Submitters and managers see submissions"
  on public.homebrew_submissions for select to authenticated
  using (submitted_by = (select auth.uid()) or public.is_campaign_manager(campaign_id));

-- ---------------------------------------------------------------
-- Reading rules, extended
-- ---------------------------------------------------------------

-- Spells: owner; anyone who can see a character that has it; members of a
-- campaign where it's approved; managers reviewing a submission of it.
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
  ) or exists (
    select 1 from public.campaign_spells cs
    where cs.spell_version_id = p_version and public.is_campaign_member(cs.campaign_id)
  ) or exists (
    select 1 from public.homebrew_submissions h
    where h.spell_version_id = p_version and public.is_campaign_manager(h.campaign_id)
  );
$$;

-- Templates: as before, plus managers reviewing a submission.
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
  ) or exists (
    select 1 from public.homebrew_submissions h
    where h.template_version_id = p_version and public.is_campaign_manager(h.campaign_id)
  );
$$;

-- Which spells may go on a character. Outside a campaign: your own
-- published spells. Inside one: spells the campaign approved, plus your own
-- if the campaign doesn't require approval.
create or replace function public.can_use_spell_version(p_version uuid, p_character uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  with own as (
    select exists (
      select 1 from public.spell_versions v
      join public.spells s on s.id = v.spell_id
      where v.id = p_version and v.status = 'published' and s.owner_id = auth.uid()
    ) as ok
  ),
  membership as (
    select cc.campaign_id, c.spells_need_approval
    from public.campaign_characters cc
    join public.campaigns c on c.id = cc.campaign_id
    where cc.character_id = p_character
  )
  select case
    when not exists (select 1 from membership) then (select ok from own)
    else exists (
      select 1 from public.campaign_spells cs, membership m
      where cs.campaign_id = m.campaign_id and cs.spell_version_id = p_version
    ) or ((select ok from own) and not (select spells_need_approval from membership))
  end;
$$;

-- ---------------------------------------------------------------
-- Actions
-- ---------------------------------------------------------------
create or replace function public.submit_homebrew(
  p_campaign uuid, p_type text, p_version uuid, p_note text default ''
)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_id uuid;
begin
  if not public.is_campaign_member(p_campaign) then raise exception 'not_allowed'; end if;

  if p_type = 'spell' then
    if not exists (
      select 1 from public.spell_versions v join public.spells s on s.id = v.spell_id
      where v.id = p_version and v.status = 'published' and s.owner_id = auth.uid()
    ) then raise exception 'not_your_content'; end if;
    if exists (select 1 from public.campaign_spells
               where campaign_id = p_campaign and spell_version_id = p_version) then
      raise exception 'already_approved';
    end if;
    if exists (select 1 from public.homebrew_submissions
               where campaign_id = p_campaign and spell_version_id = p_version and status = 'pending') then
      raise exception 'already_pending';
    end if;
    insert into public.homebrew_submissions (campaign_id, content_type, spell_version_id, submitted_by, submitter_note)
    values (p_campaign, 'spell', p_version, auth.uid(), left(coalesce(p_note, ''), 500))
    returning id into v_id;
  elsif p_type = 'template' then
    if not exists (
      select 1 from public.sheet_template_versions v join public.sheet_templates t on t.id = v.template_id
      where v.id = p_version and v.status = 'published' and t.owner_id = auth.uid()
    ) then raise exception 'not_your_content'; end if;
    if exists (select 1 from public.campaign_templates
               where campaign_id = p_campaign and template_version_id = p_version) then
      raise exception 'already_approved';
    end if;
    if exists (select 1 from public.homebrew_submissions
               where campaign_id = p_campaign and template_version_id = p_version and status = 'pending') then
      raise exception 'already_pending';
    end if;
    insert into public.homebrew_submissions (campaign_id, content_type, template_version_id, submitted_by, submitter_note)
    values (p_campaign, 'template', p_version, auth.uid(), left(coalesce(p_note, ''), 500))
    returning id into v_id;
  else
    raise exception 'invalid_input';
  end if;
  return v_id;
end;
$$;

create or replace function public.withdraw_submission(p_submission uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not exists (select 1 from public.homebrew_submissions
                 where id = p_submission and submitted_by = auth.uid()) then
    raise exception 'not_allowed';
  end if;
  delete from public.homebrew_submissions where id = p_submission and status = 'pending';
end;
$$;

create or replace function public.review_submission(p_submission uuid, p_decision text, p_note text default '')
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v public.homebrew_submissions;
begin
  select * into v from public.homebrew_submissions where id = p_submission for update;
  if v.id is null or not public.is_campaign_manager(v.campaign_id) then raise exception 'not_allowed'; end if;
  if v.status <> 'pending' then raise exception 'already_reviewed'; end if;
  if p_decision not in ('approved', 'rejected', 'changes_requested') then raise exception 'invalid_input'; end if;

  update public.homebrew_submissions
  set status = p_decision, review_note = left(coalesce(p_note, ''), 1000),
      reviewed_by = auth.uid(), reviewed_at = now()
  where id = p_submission;

  if p_decision = 'approved' then
    if v.content_type = 'spell' then
      insert into public.campaign_spells (campaign_id, spell_version_id, added_by)
      values (v.campaign_id, v.spell_version_id, auth.uid()) on conflict do nothing;
    else
      insert into public.campaign_templates (campaign_id, template_version_id, added_by)
      values (v.campaign_id, v.template_version_id, auth.uid()) on conflict do nothing;
    end if;
  end if;
end;
$$;

-- DMs add their own published spells without going through the queue.
create or replace function public.add_spell_to_campaign(p_campaign uuid, p_version uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not public.is_campaign_manager(p_campaign) then raise exception 'not_allowed'; end if;
  if not exists (
    select 1 from public.spell_versions v join public.spells s on s.id = v.spell_id
    where v.id = p_version and v.status = 'published' and s.owner_id = auth.uid()
  ) then raise exception 'not_your_content'; end if;
  insert into public.campaign_spells (campaign_id, spell_version_id, added_by)
  values (p_campaign, p_version, auth.uid()) on conflict do nothing;
end;
$$;

-- Removing a spell from the list doesn't take it off characters that have it.
create or replace function public.remove_spell_from_campaign(p_campaign uuid, p_version uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not public.is_campaign_manager(p_campaign) then raise exception 'not_allowed'; end if;
  delete from public.campaign_spells where campaign_id = p_campaign and spell_version_id = p_version;
end;
$$;

revoke execute on function public.submit_homebrew(uuid, text, uuid, text) from public, anon;
revoke execute on function public.withdraw_submission(uuid) from public, anon;
revoke execute on function public.review_submission(uuid, text, text) from public, anon;
revoke execute on function public.add_spell_to_campaign(uuid, uuid) from public, anon;
revoke execute on function public.remove_spell_from_campaign(uuid, uuid) from public, anon;
grant execute on function public.submit_homebrew(uuid, text, uuid, text) to authenticated;
grant execute on function public.withdraw_submission(uuid) to authenticated;
grant execute on function public.review_submission(uuid, text, text) to authenticated;
grant execute on function public.add_spell_to_campaign(uuid, uuid) to authenticated;
grant execute on function public.remove_spell_from_campaign(uuid, uuid) to authenticated;
