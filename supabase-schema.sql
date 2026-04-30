-- Auth uses the `userdata` and `admindata` tables.
-- See supabase-userdata-schema.sql for the full table definitions.

create or replace function public.get_email_for_username(input_username text)
returns text
language sql
security definer
set search_path = public
as $$
  select email
  from public.userdata
  where username = lower(trim(input_username))
  limit 1;
$$;

revoke all on function public.get_email_for_username(text) from public;
grant execute on function public.get_email_for_username(text) to anon, authenticated;

-- To create an admin account, insert a row into `admindata`.

create table if not exists public.app_updates (
  id uuid primary key default gen_random_uuid(),
  version text not null,
  download_url text not null,
  release_notes text,
  is_mandatory boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists app_updates_created_at_idx on public.app_updates(created_at desc);

alter table public.app_updates enable row level security;

create policy "Allow read latest update"
  on public.app_updates for select
  using (true);
