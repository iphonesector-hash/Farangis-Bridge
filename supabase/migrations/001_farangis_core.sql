create extension if not exists pgcrypto;

create table if not exists public.farangis_memory (
  id uuid primary key default gen_random_uuid(),
  device_id text not null,
  kind text not null default 'memory',
  content text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists farangis_memory_device_created_idx on public.farangis_memory(device_id, created_at desc);

create table if not exists public.farangis_actions (
  id uuid primary key default gen_random_uuid(),
  device_id text not null,
  action text not null,
  args jsonb not null default '{}'::jsonb,
  status text not null,
  result jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists farangis_actions_device_created_idx on public.farangis_actions(device_id, created_at desc);

create table if not exists public.farangis_action_queue (
  id uuid primary key default gen_random_uuid(),
  device_id text not null,
  action text not null,
  args jsonb not null default '{}'::jsonb,
  status text not null default 'pending',
  attempts integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists farangis_queue_status_idx on public.farangis_action_queue(status, created_at);

alter table public.farangis_memory enable row level security;
alter table public.farangis_actions enable row level security;
alter table public.farangis_action_queue enable row level security;

-- Server access uses SUPABASE_SERVICE_ROLE_KEY. Do not expose that key to the mobile app.
