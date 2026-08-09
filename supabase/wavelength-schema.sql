create table if not exists public.wavelength_rooms (
  code text primary key,
  state jsonb not null,
  version integer not null default 1,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists wavelength_rooms_updated_at_idx
  on public.wavelength_rooms (updated_at desc);
