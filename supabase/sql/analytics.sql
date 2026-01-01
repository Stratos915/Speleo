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

create policy "allow analytics insert for authenticated"
  on public.analytics_events
  for insert
  to authenticated
  with check (true);

create policy "allow analytics select for authenticated"
  on public.analytics_events
  for select
  to authenticated
  using (true);

create policy "allow session upsert for authenticated"
  on public.user_sessions
  for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "allow session update for authenticated"
  on public.user_sessions
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "allow session select for authenticated"
  on public.user_sessions
  for select
  to authenticated
  using (true);

create index if not exists analytics_events_created_at_idx on public.analytics_events (created_at desc);
create index if not exists user_sessions_last_seen_idx on public.user_sessions (last_seen_at desc);

create or replace function public.analytics_visits_by_day(since_param timestamptz)
returns table(day date, visits bigint, unique_users bigint)
language sql
stable
as $$
  select
    date_trunc('day', created_at) as day,
    count(*) as visits,
    count(distinct coalesce(user_email, 'anonymous')) as unique_users
  from public.analytics_events
  where created_at >= coalesce(since_param, timezone('utc', now()) - interval '30 days')
  group by 1
  order by 1;
$$;
