-- 0001: a tiny function the app calls to prove it can reach the database.
-- It reads no tables and returns only the server time.
create or replace function public.health_check()
returns json
language sql
stable
security invoker
set search_path = ''
as $$
  select json_build_object('ok', true, 'time', now());
$$;

revoke all on function public.health_check() from public;
grant execute on function public.health_check() to anon, authenticated;
