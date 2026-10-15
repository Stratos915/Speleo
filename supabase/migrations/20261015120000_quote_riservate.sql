-- =====================================================================
-- 17 · Stato delle quote riservato
-- ---------------------------------------------------------------------
-- Lo stato della quota annuale (members.membership_paid) lo vedono solo
-- amministratori, presidente, consiglio e tesoriere; lo cambiano solo
-- amministratori, presidente e tesoriere. Gli altri soci continuano a
-- leggere nome, tessera, email, telefono e anno (servono per uscite,
-- prestiti e scuola), ma non la quota.
--
-- Come:
-- * i permessi sulla tabella members diventano per colonna: la colonna
--   membership_paid non si legge e non si scrive dall'app;
-- * quote_soci(): elenco (socio, quota pagata) per chi può vederlo,
--   vuoto per gli altri;
-- * imposta_quota(socio, pagata): cambia la quota, solo per chi può.
--
-- Le policy RLS esistenti (chi vede e chi modifica le righe) non cambiano.
-- Il job delle notifiche usa la chiave di servizio e non è toccato.
-- Nuove colonne future di members vanno aggiunte ai grant qui sotto.
-- Richiede la migrazione 14 (has_any_role con tutti i ruoli).
-- Script idempotente.
-- =====================================================================

-- Permessi per colonna: tolta la quota, il resto come prima.
revoke all on public.members from anon;
revoke select, insert, update, truncate, references, trigger on public.members from authenticated;
grant select (id, old_id, full_name, membership_number, email, phone, membership_year)
  on public.members to authenticated;
grant insert (id, old_id, full_name, membership_number, email, phone, membership_year)
  on public.members to authenticated;
grant update (old_id, full_name, membership_number, email, phone, membership_year)
  on public.members to authenticated;
grant delete on public.members to authenticated;


-- Lettura delle quote: solo admin, presidente, consiglio e tesoriere.
create or replace function public.quote_soci()
returns table (member_id uuid, membership_paid boolean)
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select m.id, coalesce(m.membership_paid, false)
    from public.members m
   where public.has_any_role(array['admin', 'presidente', 'consiglio', 'tesoriere']);
$$;

revoke all on function public.quote_soci() from public, anon;
grant execute on function public.quote_soci() to authenticated;


-- Modifica della quota: solo admin, presidente e tesoriere.
create or replace function public.imposta_quota(p_member uuid, p_pagata boolean)
returns boolean
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
begin
  if not public.has_any_role(array['admin', 'presidente', 'tesoriere']) then
    raise exception 'Solo amministratori, presidente e tesoriere possono cambiare lo stato della quota.'
      using errcode = '42501';
  end if;
  update public.members set membership_paid = coalesce(p_pagata, false) where id = p_member;
  if not found then
    raise exception 'Socio non trovato.' using errcode = 'P0002';
  end if;
  return coalesce(p_pagata, false);
end;
$$;

revoke all on function public.imposta_quota(uuid, boolean) from public, anon;
grant execute on function public.imposta_quota(uuid, boolean) to authenticated;
