-- =====================================================================
-- 01 · Ruoli e profili
-- ---------------------------------------------------------------------
-- * Unica definizione di current_user_role() (prima era duplicata in
--   quattro file diversi).
-- * I profili in attesa o rifiutati non hanno alcun ruolo operativo.
-- * Un utente non può più assegnarsi da solo un ruolo o approvarsi:
--   solo admin e presidente possono modificare role, approval_status
--   e approved_at.
-- Script idempotente: si può rieseguire senza effetti collaterali.
-- =====================================================================

alter table public.profiles
  add column if not exists approval_status text default 'pending',
  add column if not exists approved_at timestamptz;

-- Ruolo dell'utente collegato, solo se il profilo è approvato.
-- I profili storici senza stato (null) sono considerati approvati.
create or replace function public.current_user_role()
returns text
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select role
    from public.profiles
   where id = auth.uid()
     and coalesce(approval_status, 'approved') = 'approved';
$$;

grant execute on function public.current_user_role() to authenticated;

create or replace function public.has_any_role(roles text[])
returns boolean
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select coalesce(public.current_user_role() = any(roles), false);
$$;

grant execute on function public.has_any_role(text[]) to authenticated;

-- Protezione delle colonne privilegiate di profiles
create or replace function public.profiles_guard_privileged_columns()
returns trigger
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
begin
  -- Nessun utente autenticato: SQL editor, service role o trigger di auth.
  if auth.uid() is null then
    return new;
  end if;

  if public.has_any_role(array['admin', 'presidente']) then
    return new;
  end if;

  if tg_op = 'INSERT' then
    new.role := 'socio';
    new.approval_status := 'pending';
    new.approved_at := null;
    return new;
  end if;

  if new.id is distinct from old.id then
    raise exception 'Operazione non consentita sul profilo.' using errcode = '42501';
  end if;

  if new.role is distinct from old.role then
    raise exception 'Solo admin o presidente possono modificare il ruolo.' using errcode = '42501';
  end if;

  -- L'utente può solo (ri)mettere la propria richiesta "in attesa".
  if new.approval_status is distinct from old.approval_status
     and coalesce(new.approval_status, '') <> 'pending' then
    raise exception 'Solo admin o presidente possono approvare un profilo.' using errcode = '42501';
  end if;

  if new.approved_at is distinct from old.approved_at then
    raise exception 'Solo admin o presidente possono approvare un profilo.' using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists profiles_guard_privileged_columns on public.profiles;
create trigger profiles_guard_privileged_columns
before insert or update on public.profiles
for each row execute function public.profiles_guard_privileged_columns();

-- ---------------------------------------------------------------------
-- VERIFICA DOPO L'ESECUZIONE
-- L'app non contiene più un'email "super admin" scritta nel codice:
-- il ruolo arriva solo da questa tabella. Controlla che almeno un
-- account abbia ruolo admin o presidente e sia approvato:
--
--   select email, role, approval_status
--     from public.profiles
--    where role in ('admin', 'presidente');
--
-- Se manca, impostalo dall'SQL editor (qui il trigger non blocca):
--
--   update public.profiles
--      set role = 'admin', approval_status = 'approved', approved_at = now()
--    where email = 'TUA_EMAIL@esempio.it';
-- ---------------------------------------------------------------------
