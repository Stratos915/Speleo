-- =====================================================================
-- 02 · Prestiti materiali transazionali
-- ---------------------------------------------------------------------
-- Problema risolto: un socio poteva modificare direttamente i propri
-- prestiti (quantità, stato) e alterare la disponibilità del magazzino.
-- Ora:
-- * soci e altri ruoli creano e chiudono prestiti SOLO tramite le
--   funzioni loan_create() e loan_return(), che controllano permessi,
--   disponibilità reale (con blocco della riga) e quantità mancanti;
-- * INSERT/UPDATE diretti sulla tabella sono riservati ad admin,
--   presidente e magazziniere;
-- * i trigger gestiscono anche le correzioni fatte dallo staff
--   (quantità, materiale, pezzi mancanti, riapertura).
-- Richiede la migrazione 01.
-- =====================================================================

alter table public.loans enable row level security;

alter table public.loans
  add column if not exists borrower_email text,
  add column if not exists missing_quantity integer default 0,
  add column if not exists missing_notes text;

create index if not exists loans_borrower_email_idx on public.loans (borrower_email);
create index if not exists loans_status_idx on public.loans (status);

create or replace function public.is_loan_manager()
returns boolean
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select public.has_any_role(array['admin', 'presidente', 'magazziniere']);
$$;

grant execute on function public.is_loan_manager() to authenticated;

drop policy if exists loans_select on public.loans;
drop policy if exists loans_insert on public.loans;
drop policy if exists loans_update on public.loans;
drop policy if exists loans_delete on public.loans;

create policy loans_select on public.loans
for select to authenticated
using (
  public.is_loan_manager()
  or (
    public.current_user_role() is not null
    and (
      borrower_email = coalesce(auth.jwt() ->> 'email', '')
      or borrower_name = coalesce(auth.jwt() ->> 'email', '')
    )
  )
);

create policy loans_insert on public.loans
for insert to authenticated
with check (public.is_loan_manager());

create policy loans_update on public.loans
for update to authenticated
using (public.is_loan_manager())
with check (public.is_loan_manager());

create policy loans_delete on public.loans
for delete to authenticated
using (public.is_loan_manager());

-- ---------------------------------------------------------------------
-- Trigger disponibilità
-- ---------------------------------------------------------------------
create or replace function public.equipment_shift_available(p_equipment_id bigint, p_delta integer)
returns void
language sql
security definer
set search_path = public
as $$
  update public.equipment
     set quantity_available = greatest(coalesce(quantity_available, quantity_total, 0) + p_delta, 0)
   where equipment_id = p_equipment_id;
$$;

revoke all on function public.equipment_shift_available(bigint, integer) from public, anon, authenticated;

create or replace function public.adjust_equipment_on_loan_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status in ('in_corso', 'active') then
    perform public.equipment_shift_available(new.equipment_id, -new.quantity);
  end if;
  return new;
end;
$$;

create or replace function public.adjust_equipment_on_loan_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  was_active boolean := old.status in ('in_corso', 'active');
  is_active boolean := new.status in ('in_corso', 'active');
  old_returned integer := old.quantity - coalesce(old.missing_quantity, 0);
  new_returned integer := new.quantity - coalesce(new.missing_quantity, 0);
begin
  if was_active and is_active then
    if new.equipment_id is distinct from old.equipment_id then
      perform public.equipment_shift_available(old.equipment_id, old.quantity);
      perform public.equipment_shift_available(new.equipment_id, -new.quantity);
    elsif new.quantity <> old.quantity then
      perform public.equipment_shift_available(new.equipment_id, old.quantity - new.quantity);
    end if;
  elsif was_active and not is_active then
    -- Chiusura: rientrano i pezzi prestati meno quelli mancanti
    perform public.equipment_shift_available(old.equipment_id, old.quantity - coalesce(new.missing_quantity, 0));
  elsif not was_active and is_active then
    -- Riapertura: si tolgono di nuovo i pezzi che erano rientrati
    perform public.equipment_shift_available(old.equipment_id, -old_returned);
  else
    -- Prestito chiuso corretto dallo staff (es. pezzi mancanti ritrovati)
    if new.equipment_id is distinct from old.equipment_id then
      perform public.equipment_shift_available(old.equipment_id, -old_returned);
      perform public.equipment_shift_available(new.equipment_id, new_returned);
    elsif new_returned <> old_returned then
      perform public.equipment_shift_available(new.equipment_id, new_returned - old_returned);
    end if;
  end if;
  return new;
end;
$$;

create or replace function public.adjust_equipment_on_loan_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.status in ('in_corso', 'active') then
    perform public.equipment_shift_available(old.equipment_id, old.quantity);
  end if;
  return old;
end;
$$;

drop trigger if exists loans_adjust_equipment_insert on public.loans;
drop trigger if exists loans_adjust_equipment_update on public.loans;
drop trigger if exists loans_adjust_equipment_delete on public.loans;

create trigger loans_adjust_equipment_insert
after insert on public.loans
for each row execute function public.adjust_equipment_on_loan_insert();

create trigger loans_adjust_equipment_update
after update of status, quantity, equipment_id, missing_quantity on public.loans
for each row execute function public.adjust_equipment_on_loan_update();

create trigger loans_adjust_equipment_delete
after delete on public.loans
for each row execute function public.adjust_equipment_on_loan_delete();

-- ---------------------------------------------------------------------
-- Funzioni chiamate dall'app
-- ---------------------------------------------------------------------
create or replace function public.loan_create(
  p_equipment_id bigint,
  p_quantity integer,
  p_borrower_name text default null,
  p_borrower_member_number integer default null,
  p_uscita_id text default null,
  p_reserved_until date default null,
  p_notes text default null
)
returns public.loans
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text := coalesce(auth.jwt() ->> 'email', '');
  v_available integer;
  v_row public.loans;
begin
  if auth.uid() is null or public.current_user_role() is null then
    raise exception 'Il tuo profilo non è ancora abilitato ai prestiti.' using errcode = '42501';
  end if;

  if p_quantity is null or p_quantity <= 0 then
    raise exception 'La quantità deve essere maggiore di zero.' using errcode = '22023';
  end if;

  select coalesce(quantity_available, quantity_total, 0)
    into v_available
    from public.equipment
   where equipment_id = p_equipment_id
   for update;

  if not found then
    raise exception 'Materiale non trovato.' using errcode = 'P0002';
  end if;

  if p_quantity > v_available then
    raise exception 'Disponibili solo % pezzi di questo materiale.', v_available using errcode = 'P0001';
  end if;

  insert into public.loans (
    equipment_id, uscita_id, reserved_until, borrower_name, borrower_email,
    borrower_member_number, quantity, notes, status, delivered_at
  )
  values (
    p_equipment_id, nullif(p_uscita_id, ''), p_reserved_until,
    coalesce(nullif(trim(p_borrower_name), ''), v_email), nullif(v_email, ''),
    p_borrower_member_number, p_quantity, nullif(trim(p_notes), ''), 'in_corso', now()
  )
  returning * into v_row;

  return v_row;
end;
$$;

create or replace function public.loan_return(
  p_loan_id uuid,
  p_missing_quantity integer default 0,
  p_missing_notes text default null
)
returns public.loans
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text := coalesce(auth.jwt() ->> 'email', '');
  v_loan public.loans;
  v_missing integer := coalesce(p_missing_quantity, 0);
begin
  if auth.uid() is null or public.current_user_role() is null then
    raise exception 'Il tuo profilo non è abilitato.' using errcode = '42501';
  end if;

  select * into v_loan from public.loans where id = p_loan_id for update;
  if not found then
    raise exception 'Prestito non trovato.' using errcode = 'P0002';
  end if;

  if not public.is_loan_manager()
     and (
       v_email = ''
       or (coalesce(v_loan.borrower_email, '') <> v_email and coalesce(v_loan.borrower_name, '') <> v_email)
     ) then
    raise exception 'Puoi chiudere solo i tuoi prestiti.' using errcode = '42501';
  end if;

  if v_loan.status not in ('in_corso', 'active') then
    raise exception 'Questo prestito è già chiuso.' using errcode = 'P0001';
  end if;

  if v_missing < 0 or v_missing > v_loan.quantity then
    raise exception 'I pezzi mancanti devono essere tra 0 e %.', v_loan.quantity using errcode = '22023';
  end if;

  update public.loans
     set status = 'chiuso',
         returned_at = now(),
         missing_quantity = v_missing,
         missing_notes = nullif(trim(p_missing_notes), '')
   where id = p_loan_id
  returning * into v_loan;

  return v_loan;
end;
$$;

revoke all on function public.loan_create(bigint, integer, text, integer, text, date, text) from public, anon;
revoke all on function public.loan_return(uuid, integer, text) from public, anon;
grant execute on function public.loan_create(bigint, integer, text, integer, text, date, text) to authenticated;
grant execute on function public.loan_return(uuid, integer, text) to authenticated;
