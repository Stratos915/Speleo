-- =====================================================================
-- 18 · Pagamenti degli acquisti riservati
-- ---------------------------------------------------------------------
-- Stessa regola delle quote (migrazione 17) per magliette e gadget
-- (member_purchases): se un socio ha pagato e quando (payment_status,
-- payment_date) lo vedono solo amministratori, presidente, consiglio e
-- tesoriere; lo cambiano solo amministratori, presidente e tesoriere.
-- Il resto dell'ordine (articolo, taglia, quantità, prezzo, stato
-- dell'ordine, date di acquisto e consegna) resta com'era: lo vede lo
-- staff e lo gestiscono segreteria e tesoriere.
--
-- Come:
-- * permessi per colonna su member_purchases: payment_status e
--   payment_date non si leggono e non si scrivono dall'app (un nuovo
--   ordine parte «da saldare», valore predefinito della colonna);
-- * pagamenti_acquisti(): elenco (acquisto, stato, data pagamento) per
--   chi può vederlo, vuoto per gli altri;
-- * imposta_pagamento_acquisto(acquisto, stato, data): solo per chi può.
--
-- Le policy RLS esistenti non cambiano. Nuove colonne future di
-- member_purchases vanno aggiunte ai grant qui sotto.
-- Richiede la migrazione 14 (has_any_role con tutti i ruoli).
-- Script idempotente.
-- =====================================================================

revoke all on public.member_purchases from anon;
revoke select, insert, update, truncate, references, trigger on public.member_purchases from authenticated;
grant select (id, member_id, item_type, size, quantity, price, status, purchase_year, notes,
              created_at, purchase_date, delivery_date)
  on public.member_purchases to authenticated;
grant insert (id, member_id, item_type, size, quantity, price, status, purchase_year, notes,
              created_at, purchase_date, delivery_date)
  on public.member_purchases to authenticated;
grant update (member_id, item_type, size, quantity, price, status, purchase_year, notes,
              purchase_date, delivery_date)
  on public.member_purchases to authenticated;
grant delete on public.member_purchases to authenticated;


-- Lettura dei pagamenti: solo admin, presidente, consiglio e tesoriere.
create or replace function public.pagamenti_acquisti()
returns table (purchase_id uuid, payment_status text, payment_date date)
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select p.id, coalesce(p.payment_status, 'unpaid'), p.payment_date
    from public.member_purchases p
   where public.has_any_role(array['admin', 'presidente', 'consiglio', 'tesoriere']);
$$;

revoke all on function public.pagamenti_acquisti() from public, anon;
grant execute on function public.pagamenti_acquisti() to authenticated;


-- Modifica del pagamento: solo admin, presidente e tesoriere.
create or replace function public.imposta_pagamento_acquisto(
  p_purchase uuid,
  p_stato text,
  p_data date default null
)
returns text
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
begin
  if not public.has_any_role(array['admin', 'presidente', 'tesoriere']) then
    raise exception 'Solo amministratori, presidente e tesoriere possono cambiare il pagamento.'
      using errcode = '42501';
  end if;
  if coalesce(p_stato, '') not in ('paid', 'unpaid') then
    raise exception 'Stato di pagamento non valido.' using errcode = '22023';
  end if;
  update public.member_purchases
     set payment_status = p_stato,
         payment_date = p_data
   where id = p_purchase;
  if not found then
    raise exception 'Acquisto non trovato.' using errcode = 'P0002';
  end if;
  return p_stato;
end;
$$;

revoke all on function public.imposta_pagamento_acquisto(uuid, text, date) from public, anon;
grant execute on function public.imposta_pagamento_acquisto(uuid, text, date) to authenticated;
