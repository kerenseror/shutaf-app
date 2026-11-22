-- Only for running the tests against a plain Postgres (not needed on Supabase,
-- which already has these). Creates a minimal auth schema and the API roles.
create schema if not exists auth;
create table if not exists auth.users (
  id uuid primary key,
  phone text,
  raw_user_meta_data jsonb default '{}'
);
create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
end $$;
grant usage on schema auth to anon, authenticated;
