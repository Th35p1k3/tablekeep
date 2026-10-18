-- 0002: accounts. Profiles, the sign-up invite list, and account deletion.
-- Run once in Supabase -> SQL Editor. Safe to re-run.

-- ---------------------------------------------------------------
-- Profiles: one row per user, readable and editable only by them.
-- ---------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null
    check (char_length(display_name) between 1 and 50),
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

revoke all on public.profiles from anon, authenticated;
grant select on public.profiles to authenticated;
grant update (display_name) on public.profiles to authenticated;

drop policy if exists "Users read their own profile" on public.profiles;
create policy "Users read their own profile"
  on public.profiles for select to authenticated
  using ((select auth.uid()) = id);

drop policy if exists "Users update their own profile" on public.profiles;
create policy "Users update their own profile"
  on public.profiles for update to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);
-- No insert or delete policies: rows are created by the trigger below and
-- removed automatically when the user is deleted.

-- Create a profile whenever a user signs up.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    left(
      coalesce(
        nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''),
        split_part(new.email, '@', 1),
        'Adventurer'
      ),
      50
    )
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------
-- Invite list: only these emails may create an account.
-- Managed by you in Table Editor. Nobody can read it from the app.
-- ---------------------------------------------------------------
create table if not exists public.signup_allowlist (
  email text primary key,
  note text,
  added_at timestamptz not null default now()
);

alter table public.signup_allowlist enable row level security;
revoke all on public.signup_allowlist from anon, authenticated;

-- Called by Supabase Auth before creating any user
-- (enable it under Authentication -> Hooks -> Before User Created).
create or replace function public.hook_before_user_created(event jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_email text := lower(trim(event -> 'user' ->> 'email'));
begin
  if new_email is not null and exists (
    select 1 from public.signup_allowlist a
    where lower(trim(a.email)) = new_email
  ) then
    return '{}'::jsonb;
  end if;

  return jsonb_build_object(
    'error', jsonb_build_object(
      'http_code', 403,
      'message', 'This email is not on the invite list.'
    )
  );
end;
$$;

grant usage on schema public to supabase_auth_admin;
grant execute on function public.hook_before_user_created(jsonb)
  to supabase_auth_admin;
revoke execute on function public.hook_before_user_created(jsonb)
  from public, anon, authenticated;

-- ---------------------------------------------------------------
-- Account deletion: a signed-in user can delete only themselves.
-- Their profile is removed by the cascade on profiles.id.
-- ---------------------------------------------------------------
create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Not signed in';
  end if;
  delete from auth.users where id = auth.uid();
end;
$$;

revoke execute on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
