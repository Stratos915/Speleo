-- =====================================================================
-- 07 · Notifiche senza doppioni
-- ---------------------------------------------------------------------
-- L'indice univoco precedente includeva colonne quasi sempre NULL:
-- in Postgres due NULL non sono mai uguali, quindi l'indice non
-- bloccava nulla e la stessa email poteva partire più volte.
-- Ora ogni avviso è identificato da (kind, ref_id).
-- =====================================================================

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

alter table public.notification_log add column if not exists ref_id text;

-- Tabella usata solo dal job con service role: nessun accesso dal browser.
alter table public.notification_log enable row level security;

-- Recupera i record storici tenendo solo il primo per ciascun prestito
update public.notification_log n
   set ref_id = n.loan_id::text
 where n.ref_id is null
   and n.loan_id is not null
   and n.id = (
     select m.id
       from public.notification_log m
      where m.kind = n.kind and m.loan_id = n.loan_id
      order by m.created_at nulls last, m.id
      limit 1
   );

create unique index if not exists notification_log_kind_ref_idx
  on public.notification_log (kind, ref_id);
