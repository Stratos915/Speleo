-- =====================================================================
-- 03 · Privacy delle statistiche di accesso
-- ---------------------------------------------------------------------
-- Prima qualsiasi utente autenticato poteva leggere la cronologia di
-- navigazione e le email di tutti. Ora:
-- * analytics_events e user_sessions sono leggibili solo da admin e
--   presidente (ognuno vede comunque i propri dati);
-- * non si possono più inserire eventi a nome di altri utenti.
-- =====================================================================

alter table public.analytics_events enable row level security;
alter table public.user_sessions enable row level security;

drop policy if exists "allow analytics insert for authenticated" on public.analytics_events;
drop policy if exists "allow analytics select for authenticated" on public.analytics_events;
drop policy if exists analytics_events_insert on public.analytics_events;
drop policy if exists analytics_events_select on public.analytics_events;

create policy analytics_events_insert on public.analytics_events
for insert to authenticated
with check (user_id = auth.uid());

create policy analytics_events_select on public.analytics_events
for select to authenticated
using (
  public.has_any_role(array['admin', 'presidente'])
  or user_id = auth.uid()
);

drop policy if exists "allow session select for authenticated" on public.user_sessions;
drop policy if exists user_sessions_select on public.user_sessions;

create policy user_sessions_select on public.user_sessions
for select to authenticated
using (
  public.has_any_role(array['admin', 'presidente'])
  or user_id = auth.uid()
);

-- La funzione del grafico visite rispetta le policy di chi la chiama.
create or replace function public.analytics_visits_by_day(since_param timestamptz)
returns table(day date, visits bigint, unique_users bigint)
language sql
stable
security invoker
as $$
  select
    date_trunc('day', created_at)::date as day,
    count(*) as visits,
    count(distinct coalesce(user_email, 'anonymous')) as unique_users
  from public.analytics_events
  where created_at >= coalesce(since_param, timezone('utc', now()) - interval '30 days')
  group by 1
  order by 1;
$$;

-- Conservazione: gli eventi più vecchi di 13 mesi non servono ai report.
-- Da eseguire a mano quando serve (o da pianificare):
--   delete from public.analytics_events where created_at < now() - interval '13 months';
