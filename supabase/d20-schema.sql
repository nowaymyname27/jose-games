create table if not exists public.d20_rooms (
  code text primary key,
  state jsonb not null,
  version integer not null default 1,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists d20_rooms_updated_at_idx
  on public.d20_rooms (updated_at desc);
