create table if not exists userdata (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  username text not null unique,
  email text not null unique,
  password text not null,
  ban boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists admindata (
  id uuid primary key default gen_random_uuid(),
  admin_id text not null unique,
  name text not null,
  password text not null,
  created_at timestamptz not null default now()
);

-- This project uses table-based login from browser JavaScript.
-- Keep RLS disabled for the simple beginner setup, or add your own policies.
alter table userdata disable row level security;
alter table admindata disable row level security;

-- Create your first admin account:
insert into admindata (admin_id, name, password)
values ('admin001', 'Admin', 'admin123');
