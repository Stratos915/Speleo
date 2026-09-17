-- =====================================================================
-- 06 · Uscite: orario di rientro previsto
-- ---------------------------------------------------------------------
-- * Aggiunge il rientro previsto per i promemoria automatici.
-- * Introduce lo stato aperta / chiusa.
-- * Le vecchie uscite già concluse vengono inizializzate come chiuse.
-- * Le uscite di oggi o future restano aperte.
-- * Le nuove uscite partono automaticamente come "aperta".
-- =====================================================================


-- ---------------------------------------------------------------------
-- Nuove colonne
-- ---------------------------------------------------------------------

alter table public.uscite
  add column if not exists rientro_previsto timestamptz,
  add column if not exists status text,
  add column if not exists closed_at timestamptz;


-- ---------------------------------------------------------------------
-- Migrazione delle uscite già esistenti
-- ---------------------------------------------------------------------
--
-- Prima dell'introduzione di "status" le uscite storiche non avevano
-- un'indicazione esplicita di chiusura.
--
-- Consideriamo quindi:
--
--   data precedente a oggi  -> chiusa
--   oggi o futuro           -> aperta
--
-- Vengono modificati soltanto record senza stato, quindi una eventuale
-- riesecuzione non modifica stati già impostati manualmente.
-- ---------------------------------------------------------------------

update public.uscite
   set status =
       case
         when data is not null
          and data < current_date
           then 'chiusa'
         else 'aperta'
       end
 where status is null;


-- Da ora in avanti ogni nuova uscita nasce aperta.

alter table public.uscite
  alter column status set default 'aperta';


-- ---------------------------------------------------------------------
-- Indice utilizzato dal job notifiche
-- ---------------------------------------------------------------------

create index if not exists uscite_rientro_aperte_idx
  on public.uscite (rientro_previsto)
  where status is distinct from 'chiusa';


-- =====================================================================
-- VERIFICA DOPO L'ESECUZIONE
-- =====================================================================
--
-- select
--   id,
--   titolo,
--   data,
--   rientro_previsto,
--   status,
--   closed_at
-- from public.uscite
-- order by data desc;
--
-- =====================================================================
