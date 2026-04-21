create table if not exists public.user_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null,
  username text not null unique,
  email text not null unique,
  role text not null default 'user' check (role in ('user', 'admin')),
  bio text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_login_at timestamptz
);

alter table public.user_profiles enable row level security;

create policy "Users can read own profile"
  on public.user_profiles for select
  using (auth.uid() = id);

create policy "Users can update own profile"
  on public.user_profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

create index if not exists user_profiles_role_idx on public.user_profiles(role);
create index if not exists user_profiles_created_at_idx on public.user_profiles(created_at desc);

-- After creating your first account, promote it manually in Supabase SQL:
-- update public.user_profiles set role = 'admin' where email = 'you@example.com';
