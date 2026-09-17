-- =====================================================================
-- 03 · Privacy delle statistiche di accesso
-- ---------------------------------------------------------------------
-- * Ogni utente può registrare solamente i propri eventi.
-- * Ogni utente può creare e aggiornare solamente la propria sessione.
-- * Admin e presidente possono leggere tutte le statistiche.
-- * Gli altri utenti possono leggere solamente i propri dati.
-- * Nessun utente può registrare eventi o sessioni a nome di altri.
-- * Richiede la migrazione 01.
-- =====================================================================


-- ---------------------------------------------------------------------
-- Attivazione RLS
-- ---------------------------------------------------------------------

alter table public.analytics_events
  enable row level security;

alter table public.user_sessions
  enable row level security;


-- =====================================================================
-- ANALYTICS EVENTS
-- =====================================================================


-- Elimina sia le vecchie policy sia eventuali versioni precedenti
-- della migrazione.

drop policy if exists
  "allow analytics insert for authenticated"
  on public.analytics_events;

drop policy if exists
  "allow analytics select for authenticated"
  on public.analytics_events;

drop policy if exists
  analytics_events_insert
  on public.analytics_events;

drop policy if exists
  analytics_events_select
  on public.analytics_events;


-- ---------------------------------------------------------------------
-- INSERT
-- ---------------------------------------------------------------------
-- Un utente autenticato può registrare soltanto un evento
-- associato al proprio account e alla propria email.

create policy analytics_events_insert
on public.analytics_events
for insert
to authenticated
with check (
  user_id = auth.uid()
  and user_email = coalesce(auth.jwt() ->> 'email', '')
);


-- ---------------------------------------------------------------------
-- SELECT
-- ---------------------------------------------------------------------
-- Admin e presidente vedono tutti gli eventi.
-- Ogni altro utente autenticato vede solamente i propri.

create policy analytics_events_select
on public.analytics_events
for select
to authenticated
using (
  public.has_any_role(
    array['admin', 'presidente']
  )
  or user_id = auth.uid()
);


-- =====================================================================
-- USER SESSIONS
-- =====================================================================


-- Elimina le vecchie policy.

drop policy if exists
  "allow session upsert for authenticated"
  on public.user_sessions;

drop policy if exists
  "allow session update for authenticated"
  on public.user_sessions;

drop policy if exists
  "allow session select for authenticated"
  on public.user_sessions;

drop policy if exists
  user_sessions_insert
  on public.user_sessions;

drop policy if exists
  user_sessions_update
  on public.user_sessions;

drop policy if exists
  user_sessions_select
  on public.user_sessions;


-- ---------------------------------------------------------------------
-- INSERT
-- ---------------------------------------------------------------------
-- Necessaria per il primo ping della sessione.

create policy user_sessions_insert
on public.user_sessions
for insert
to authenticated
with check (
  user_id = auth.uid()
  and user_email = coalesce(auth.jwt() ->> 'email', '')
);


-- ---------------------------------------------------------------------
-- UPDATE
-- ---------------------------------------------------------------------
-- Necessaria per i ping successivi (upsert).

create policy user_sessions_update
on public.user_sessions
for update
to authenticated
using (
  user_id = auth.uid()
)
with check (
  user_id = auth.uid()
  and user_email = coalesce(auth.jwt() ->> 'email', '')
);


-- ---------------------------------------------------------------------
-- SELECT
-- ---------------------------------------------------------------------
-- Admin e presidente vedono tutte le sessioni.
-- Ogni altro utente vede solamente la propria.

create policy user_sessions_select
on public.user_sessions
for select
to authenticated
using (
  public.has_any_role(
    array['admin', 'presidente']
  )
  or user_id = auth.uid()
);


-- =====================================================================
-- STATISTICHE VISITE
-- =====================================================================
-- SECURITY INVOKER è intenzionale:
-- la funzione rispetta le policy RLS dell'utente che la chiama.
--
-- Admin e presidente ottengono quindi il totale generale.
-- Gli altri utenti, qualora chiamassero la funzione, vedrebbero
-- solamente i propri eventi.
-- =====================================================================

create or replace function public.analytics_visits_by_day(
  since_param timestamptz
)
returns table (
  day date,
  visits bigint,
  unique_users bigint
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    date_trunc('day', created_at)::date as day,
    count(*) as visits,
    count(
      distinct coalesce(
        user_email,
        'anonymous'
      )
    ) as unique_users
  from public.analytics_events
  where created_at >= coalesce(
    since_param,
    timezone('utc', now()) - interval '30 days'
  )
  group by 1
  order by 1;
$$;


-- Permessi espliciti sulla funzione.

revoke all
on function public.analytics_visits_by_day(timestamptz)
from public, anon;

grant execute
on function public.analytics_visits_by_day(timestamptz)
to authenticated;


-- =====================================================================
-- CONSERVAZIONE DATI
-- =====================================================================
--
-- Gli eventi più vecchi di 13 mesi possono essere eliminati
-- periodicamente:
--
-- delete
-- from public.analytics_events
-- where created_at < now() - interval '13 months';
--
-- =====================================================================
