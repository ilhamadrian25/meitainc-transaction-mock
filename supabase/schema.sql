-- Jalankan sekali di Supabase SQL Editor project kamu.
create table if not exists public.mock_rules (
  id           text primary key,
  source       text not null default 'default',
  description  text,
  enabled      boolean not null default true,
  priority     integer not null default 0,
  request      jsonb not null,
  response     jsonb not null default '{}'::jsonb,
  sequence     jsonb,
  updated_at   timestamptz not null default now()
);

create index if not exists mock_rules_source_idx on public.mock_rules (source);

create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists mock_rules_set_updated_at on public.mock_rules;
create trigger mock_rules_set_updated_at
  before update on public.mock_rules
  for each row execute function public.set_updated_at();

-- RLS aktif tapi tidak ada policy untuk anon/authenticated: hanya service_role
-- (dipakai server Next.js) yang bisa baca/tulis, karena service_role selalu
-- melewati RLS. Ini mencegah key publik mana pun mengubah rule mock kamu.
alter table public.mock_rules enable row level security;
