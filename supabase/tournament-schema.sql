create table if not exists public.tournament_rooms (
  code text primary key,
  state jsonb not null,
  version integer not null default 1,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists tournament_rooms_updated_at_idx
  on public.tournament_rooms (updated_at desc);
