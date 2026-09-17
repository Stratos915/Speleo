-- =====================================================================
-- 08 · Chiusura di permessi troppo ampi già presenti nel database
-- ---------------------------------------------------------------------
-- Due regole storiche erano molto più permissive di quanto previsto
-- dall'app e dal manuale:
--
-- 1. una policy sulle uscite, chiamata "delete " (con uno spazio finale),
--    permetteva a QUALSIASI utente collegato, anche in attesa di
--    approvazione, di eliminare qualsiasi uscita;
-- 2. le policy del bucket delle foto valevano per il ruolo "public",
--    cioè anche per chi non ha effettuato l'accesso: chiunque poteva
--    caricare, sostituire o cancellare le foto delle uscite.
--
-- Qui vengono allineate ai permessi reali:
-- * eliminazione delle uscite: admin e presidente;
-- * caricamento foto: profili approvati che possono gestire le uscite;
-- * cancellazione foto: admin e presidente.
--
-- Le foto restano visibili tramite i link pubblici già in uso (il
-- bucket è pubblico: il download diretto non passa da queste regole).
--
-- Richiede la migrazione 01 (has_any_role).
-- Script idempotente.
-- =====================================================================


-- ---------------------------------------------------------------------
-- Uscite: eliminazione riservata ad admin e presidente
-- ---------------------------------------------------------------------
-- Restano attive le policy uscite_delete e uscite_delete_admin_presidente,
-- che consentono l'eliminazione ad admin e presidente.

drop policy if exists "delete " on public.uscite;
drop policy if exists "delete" on public.uscite;


-- ---------------------------------------------------------------------
-- Foto delle uscite
-- ---------------------------------------------------------------------

drop policy if exists public_select_uscite_foto on storage.objects;
drop policy if exists public_insert_uscite_foto on storage.objects;
drop policy if exists public_update_uscite_foto on storage.objects;
drop policy if exists public_delete_uscite_foto on storage.objects;

drop policy if exists uscite_foto_select on storage.objects;
drop policy if exists uscite_foto_insert on storage.objects;
drop policy if exists uscite_foto_update on storage.objects;
drop policy if exists uscite_foto_delete on storage.objects;


-- Elenco dei file: solo profili approvati.
-- La visualizzazione delle foto nell'app usa i link pubblici e
-- non dipende da questa regola.

create policy uscite_foto_select on storage.objects
for select to authenticated
using (
  bucket_id = 'uscite-foto'
  and public.current_user_role() is not null
);


-- Caricamento: gli stessi ruoli che possono gestire le uscite.

create policy uscite_foto_insert on storage.objects
for insert to authenticated
with check (
  bucket_id = 'uscite-foto'
  and public.has_any_role(
    array['admin', 'presidente', 'magazziniere', 'socio']
  )
);


create policy uscite_foto_update on storage.objects
for update to authenticated
using (
  bucket_id = 'uscite-foto'
  and public.has_any_role(
    array['admin', 'presidente', 'magazziniere', 'socio']
  )
)
with check (
  bucket_id = 'uscite-foto'
  and public.has_any_role(
    array['admin', 'presidente', 'magazziniere', 'socio']
  )
);


-- Cancellazione: solo admin e presidente.

create policy uscite_foto_delete on storage.objects
for delete to authenticated
using (
  bucket_id = 'uscite-foto'
  and public.has_any_role(array['admin', 'presidente'])
);


-- =====================================================================
-- VERIFICA DOPO L'ESECUZIONE
-- =====================================================================
--
-- Nessuna policy deve valere per il ruolo public (cioè per chi non ha
-- effettuato l'accesso):
--
-- select tablename, policyname, cmd, roles
--   from pg_policies
--  where (schemaname = 'public' and tablename = 'uscite')
--     or (schemaname = 'storage' and policyname like '%uscite_foto%')
--  order by tablename, policyname;
--
-- =====================================================================
