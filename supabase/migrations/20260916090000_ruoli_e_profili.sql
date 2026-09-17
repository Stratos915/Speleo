-- =====================================================================
-- 01 · Ruoli e profili
-- ---------------------------------------------------------------------
-- * Unica definizione di current_user_role() (prima era duplicata in
--   quattro file diversi).
-- * I profili in attesa o rifiutati non hanno alcun ruolo operativo.
-- * Un utente non può più assegnarsi da solo un ruolo o approvarsi:
--   solo admin e presidente possono modificare role, approval_status
--   e approved_at.
-- * Gli utenti già esistenti vengono mantenuti come approvati.
-- * I nuovi utenti partono invece con stato "pending".
-- * Script idempotente: si può rieseguire senza effetti collaterali.
-- =====================================================================


-- ---------------------------------------------------------------------
-- Stato di approvazione dei profili
-- ---------------------------------------------------------------------

do $migration$
declare
  v_approval_status_esiste boolean;
begin

  -- Verifica se la colonna esisteva PRIMA di questa migrazione.
  select exists (
    select 1
      from information_schema.columns
     where table_schema = 'public'
       and table_name = 'profiles'
       and column_name = 'approval_status'
  )
  into v_approval_status_esiste;


  -- Crea le colonne se non esistono.
  alter table public.profiles
    add column if not exists approval_status text,
    add column if not exists approved_at timestamptz;


  -- Solo alla PRIMA installazione della colonna:
  -- gli utenti già esistenti vengono considerati approvati.
  --
  -- Se la migration viene rieseguita in futuro, gli utenti "pending"
  -- NON vengono approvati automaticamente.
  if not v_approval_status_esiste then

    update public.profiles
       set approval_status = 'approved',
           approved_at = coalesce(approved_at, now())
     where approval_status is null;

  end if;


  -- Tutti i nuovi profili creati da questo momento partono in attesa.
  alter table public.profiles
    alter column approval_status set default 'pending';

end
$migration$;


-- ---------------------------------------------------------------------
-- Ruolo dell'utente collegato
-- ---------------------------------------------------------------------
-- Restituisce il ruolo solo se il profilo è approvato.

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
     and approval_status = 'approved';
$$;

grant execute on function public.current_user_role() to authenticated;


-- ---------------------------------------------------------------------
-- Controllo rapido di appartenenza a uno o più ruoli
-- ---------------------------------------------------------------------

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


-- ---------------------------------------------------------------------
-- Protezione delle colonne privilegiate di profiles
-- ---------------------------------------------------------------------

create or replace function public.profiles_guard_privileged_columns()
returns trigger
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
begin

  -- Nessun utente autenticato:
  -- SQL editor, service role oppure trigger interno di auth.
  if auth.uid() is null then
    return new;
  end if;


  -- Admin e presidente possono modificare le colonne privilegiate.
  if public.has_any_role(array['admin', 'presidente']) then
    return new;
  end if;


  -- Un nuovo utente non può scegliersi autonomamente un ruolo
  -- né approvare il proprio profilo.
  if tg_op = 'INSERT' then
    new.role := 'socio';
    new.approval_status := 'pending';
    new.approved_at := null;
    return new;
  end if;


  -- L'identificativo del profilo non può essere cambiato.
  if new.id is distinct from old.id then
    raise exception 'Operazione non consentita sul profilo.'
      using errcode = '42501';
  end if;


  -- Solo admin o presidente possono modificare il ruolo.
  if new.role is distinct from old.role then
    raise exception 'Solo admin o presidente possono modificare il ruolo.'
      using errcode = '42501';
  end if;


  -- Un utente può soltanto riportare la propria richiesta allo stato
  -- "pending", ma non può approvarsi o rifiutarsi autonomamente.
  if new.approval_status is distinct from old.approval_status
     and coalesce(new.approval_status, '') <> 'pending' then
    raise exception 'Solo admin o presidente possono approvare un profilo.'
      using errcode = '42501';
  end if;


  -- La data di approvazione può essere modificata solo dallo staff.
  if new.approved_at is distinct from old.approved_at then
    raise exception 'Solo admin o presidente possono approvare un profilo.'
      using errcode = '42501';
  end if;


  return new;
end;
$$;


-- ---------------------------------------------------------------------
-- Trigger di protezione
-- ---------------------------------------------------------------------

drop trigger if exists profiles_guard_privileged_columns
  on public.profiles;

create trigger profiles_guard_privileged_columns
before insert or update on public.profiles
for each row
execute function public.profiles_guard_privileged_columns();


-- =====================================================================
-- VERIFICA DOPO L'ESECUZIONE
-- =====================================================================
--
-- Controllare che almeno un account abbia ruolo admin o presidente
-- e risulti approvato:
--
-- select email, role, approval_status, approved_at
--   from public.profiles
--  where role in ('admin', 'presidente');
--
--
-- Se necessario, dall'SQL Editor di Supabase:
--
-- update public.profiles
--    set role = 'admin',
--        approval_status = 'approved',
--        approved_at = coalesce(approved_at, now())
--  where email = 'TUA_EMAIL@esempio.it';
--
-- =====================================================================
