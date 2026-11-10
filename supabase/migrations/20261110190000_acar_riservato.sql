-- =====================================================================
-- 21 · Magazzino ACAR riservato come il materiale scuola
-- ---------------------------------------------------------------------
-- Il magazzino ACAR (migrazione 20) non è più visibile ai soci semplici:
-- lo vedono admin, presidente, consiglio, segretario, tesoriere,
-- magazziniere e direttore scuola (anche come ruolo in più).
-- Chi lo modifica non cambia: admin, presidente e magazziniere.
-- Script idempotente.
-- =====================================================================

drop policy if exists acar_materiale_select on public.acar_materiale;
create policy acar_materiale_select on public.acar_materiale
for select to authenticated
using (
  public.has_any_role(array[
    'admin', 'presidente', 'consiglio', 'segretario',
    'tesoriere', 'magazziniere', 'direttore_scuola'
  ])
);
