-- Nur fuer den Schematest gegen ein nacktes PostgreSQL.
-- Bildet die Teile der Supabase-Plattform nach, die die Migrationen brauchen.
-- Wird NICHT gegen eine echte Supabase-Instanz eingespielt.

create schema if not exists auth;
create schema if not exists storage;

create table if not exists auth.users (
  id         uuid primary key default gen_random_uuid(),
  email      text,
  created_at timestamptz not null default now()
);

-- Supabase leitet auth.uid() aus dem JWT ab; im Test setzen wir den Claim direkt.
create or replace function auth.uid() returns uuid
language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;

do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
end $$;

create table if not exists storage.buckets (
  id text primary key, name text, public boolean,
  file_size_limit bigint, allowed_mime_types text[]
);

create table if not exists storage.objects (
  id        uuid primary key default gen_random_uuid(),
  bucket_id text,
  name      text
);

create or replace function storage.foldername(name text) returns text[]
language sql immutable as $$
  select (string_to_array(name, '/'))[1 : array_length(string_to_array(name, '/'), 1) - 1]
$$;

-- Zusicherungs-Helfer fuer die Tests
create or replace function test_assert(p_condition boolean, p_message text) returns void
language plpgsql as $$
begin
  if not p_condition then
    raise exception 'FEHLGESCHLAGEN: %', p_message;
  end if;
  raise notice '  ok  %', p_message;
end $$;

create or replace function test_expect_error(p_sql text, p_message text) returns void
language plpgsql as $$
begin
  execute p_sql;
  raise exception 'FEHLGESCHLAGEN: % (erwartete einen Fehler, bekam keinen)', p_message;
exception
  when others then
    if sqlerrm like 'FEHLGESCHLAGEN:%' then
      raise;
    end if;
    raise notice '  ok  % [%]', p_message, left(sqlerrm, 60);
end $$;
