create table if not exists public.blind_rank_rooms (
  code text primary key,
  state jsonb not null,
  version integer not null default 1,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists blind_rank_rooms_updated_at_idx
  on public.blind_rank_rooms (updated_at desc);
