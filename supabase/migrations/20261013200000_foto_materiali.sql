-- =====================================================================
-- 12 · Foto dei materiali in inventario
-- ---------------------------------------------------------------------
-- * equipment.foto_path: percorso della foto nell'archivio materiali-foto.
-- * Archivio materiali-foto: immagini piccole (l'app le riduce a 800 px
--   prima di caricarle), massimo 2 MB, solo JPEG, PNG o WebP.
--   Lettura pubblica tramite link: sono foto di attrezzatura, senza dati
--   personali, e il nome del file è casuale.
--   Caricare, sostituire ed eliminare: solo admin, presidente e
--   magazziniere, gli stessi che possono modificare l'inventario.
--
-- Non tocca quantità, prestiti né altre colonne. Script idempotente.
-- =====================================================================

alter table public.equipment add column if not exists foto_path text;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('materiali-foto', 'materiali-foto', true, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
   set public = excluded.public,
       file_size_limit = excluded.file_size_limit,
       allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists materiali_foto_select on storage.objects;
drop policy if exists materiali_foto_insert on storage.objects;
drop policy if exists materiali_foto_update on storage.objects;
drop policy if exists materiali_foto_delete on storage.objects;

create policy materiali_foto_select on storage.objects
for select to authenticated
using (bucket_id = 'materiali-foto' and public.current_user_role() is not null);

create policy materiali_foto_insert on storage.objects
for insert to authenticated
with check (bucket_id = 'materiali-foto' and public.has_any_role(array['admin', 'presidente', 'magazziniere']));

create policy materiali_foto_update on storage.objects
for update to authenticated
using (bucket_id = 'materiali-foto' and public.has_any_role(array['admin', 'presidente', 'magazziniere']))
with check (bucket_id = 'materiali-foto' and public.has_any_role(array['admin', 'presidente', 'magazziniere']));

create policy materiali_foto_delete on storage.objects
for delete to authenticated
using (bucket_id = 'materiali-foto' and public.has_any_role(array['admin', 'presidente', 'magazziniere']));


-- =====================================================================
-- VERIFICA: deve restituire 1 riga per la colonna e 4 policy
-- =====================================================================
-- select column_name from information_schema.columns
--  where table_name = 'equipment' and column_name = 'foto_path';
-- select policyname from pg_policies where policyname like 'materiali_foto_%';
