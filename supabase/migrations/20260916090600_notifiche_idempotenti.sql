-- =====================================================================
-- 07 · Notifiche senza doppioni
-- ---------------------------------------------------------------------
-- * Ogni avviso è identificato in modo univoco da (kind, ref_id).
-- * Sostituisce il vecchio indice basato su colonne nullable.
-- * Conserva gli eventuali log storici.
-- * Il job usa la service role: nessun accesso diretto dal browser.
-- =====================================================================


-- ---------------------------------------------------------------------
-- Tabella log notifiche
-- ---------------------------------------------------------------------

create table if not exists public.notification_log (
  id uuid primary key default gen_random_uuid(),
  loan_id uuid,
  kind text not null,
  target_role text,
  target_email text,
  status text default 'PENDING',
  message text,
  meta jsonb,
  created_at timestamptz default now()
);


-- Garantisce che anche un'eventuale tabella preesistente
-- abbia tutte le colonne richieste dal nuovo notification-cron.

alter table public.notification_log
  add column if not exists loan_id uuid,
  add column if not exists kind text,
  add column if not exists target_role text,
  add column if not exists target_email text,
  add column if not exists status text default 'PENDING',
  add column if not exists message text,
  add column if not exists meta jsonb,
  add column if not exists created_at timestamptz default now(),
  add column if not exists ref_id text;


-- ---------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------
-- Questa tabella viene utilizzata dal job tramite service role.
-- Il browser non deve accedervi direttamente.

alter table public.notification_log
  enable row level security;


-- ---------------------------------------------------------------------
-- Migrazione dei record storici
-- ---------------------------------------------------------------------
--
-- Per i vecchi log relativi ai prestiti:
-- il primo record di ogni coppia (kind, loan_id) riceve come ref_id
-- proprio il loan_id.
--
-- In questo modo un nuovo tentativo dello stesso avviso sarà bloccato
-- dall'indice univoco.
-- ---------------------------------------------------------------------

update public.notification_log n
   set ref_id = n.loan_id::text
 where n.ref_id is null
   and n.loan_id is not null
   and n.id = (
     select m.id
       from public.notification_log m
      where m.kind = n.kind
        and m.loan_id = n.loan_id
      order by
        m.created_at nulls last,
        m.id
      limit 1
   );


-- Eventuali altri record storici senza ref_id vengono conservati
-- assegnando un identificativo legacy univoco.

update public.notification_log
   set ref_id = 'legacy:' || id::text
 where ref_id is null;


-- ---------------------------------------------------------------------
-- Rimozione del vecchio indice
-- ---------------------------------------------------------------------
--
-- Il vecchio indice includeva target_role e target_email.
-- Poiché tali colonne potevano essere NULL, non garantiva
-- realmente l'idempotenza.

drop index if exists public.notification_log_unique_idx;


-- Ricreiamo anche il nuovo indice nel caso la migration venga
-- rieseguita dopo una versione precedente.

drop index if exists public.notification_log_kind_ref_idx;


create unique index notification_log_kind_ref_idx
  on public.notification_log (kind, ref_id);


-- ---------------------------------------------------------------------
-- Vincoli finali
-- ---------------------------------------------------------------------

alter table public.notification_log
  alter column ref_id set not null;


-- =====================================================================
-- VERIFICA DOPO L'ESECUZIONE
-- =====================================================================
--
-- select
--   kind,
--   ref_id,
--   status,
--   created_at
-- from public.notification_log
-- order by created_at desc;
--
--
-- Non devono esistere duplicati:
--
-- select
--   kind,
--   ref_id,
--   count(*)
-- from public.notification_log
-- group by kind, ref_id
-- having count(*) > 1;
--
-- =====================================================================
