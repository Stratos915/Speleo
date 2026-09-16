-- Analytics tracking tables
-- Esegui questo script dal SQL editor di Supabase per creare le tabelle
-- richieste dalla pagina Report. Ricordati di adattare eventuali nomi
-- di schema se stai usando qualcosa di diverso da "public".

create table if not exists public.analytics_events (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid,
  user_email text,
  page text not null,
  event text not null default 'page_view',
  meta jsonb default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.user_sessions (
  user_id uuid primary key,
  user_email text not null,
  last_seen_at timestamptz not null default timezone('utc', now()),
  client_info jsonb default '{}'::jsonb
);

alter table public.analytics_events enable row level security;
alter table public.user_sessions enable row level security;

-- Le policy RLS sono in supabase/migrations/20260916090200_privacy_statistiche.sql
-- (le statistiche sono visibili solo ad admin e presidente).

create index if not exists analytics_events_created_at_idx on public.analytics_events (created_at desc);
create index if not exists user_sessions_last_seen_idx on public.user_sessions (last_seen_at desc);

-- La funzione analytics_visits_by_day è definita nella migrazione 20260916090200.
