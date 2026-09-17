-- =====================================================================
-- 02 · Prestiti materiali transazionali
-- ---------------------------------------------------------------------
-- * I prestiti vengono creati e chiusi tramite loan_create()
--   e loan_return().
-- * INSERT / UPDATE / DELETE diretti sono riservati a
--   admin, presidente e magazziniere.
-- * La disponibilità del magazzino viene aggiornata atomicamente.
-- * Un prestito attivo rende indisponibile tutta la quantità prestata.
-- * Un prestito chiuso rende indisponibili solamente gli eventuali
--   pezzi mancanti.
-- * Correzioni, riaperture, cambi materiale e cancellazioni vengono
--   gestiti senza falsare la disponibilità.
-- * Richiede la migrazione 01.
-- =====================================================================


-- ---------------------------------------------------------------------
-- Colonne e vincoli
-- ---------------------------------------------------------------------

alter table public.loans enable row level security;

alter table public.loans
  add column if not exists borrower_email text,
  add column if not exists missing_quantity integer default 0,
  add column if not exists missing_notes text;

create index if not exists loans_borrower_email_idx
  on public.loans (borrower_email);

create index if not exists loans_status_idx
  on public.loans (status);


-- missing_quantity deve essere coerente con la quantità prestata.

alter table public.loans
  drop constraint if exists loans_missing_quantity_check;

alter table public.loans
  add constraint loans_missing_quantity_check
  check (
    missing_quantity >= 0
    and missing_quantity <= quantity
  );


-- ---------------------------------------------------------------------
-- Ruoli autorizzati alla gestione diretta
-- ---------------------------------------------------------------------

create or replace function public.is_loan_manager()
returns boolean
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select public.has_any_role(
    array['admin', 'presidente', 'magazziniere']
  );
$$;

grant execute on function public.is_loan_manager()
to authenticated;


-- ---------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------

drop policy if exists loans_select on public.loans;
drop policy if exists loans_insert on public.loans;
drop policy if exists loans_update on public.loans;
drop policy if exists loans_delete on public.loans;


-- Admin, presidente e magazziniere vedono tutto.
-- Gli altri utenti vedono solamente i propri prestiti.

create policy loans_select
on public.loans
for select
to authenticated
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


-- Inserimento diretto consentito solamente ai gestori.
-- Gli utenti normali usano loan_create().

create policy loans_insert
on public.loans
for insert
to authenticated
with check (
  public.is_loan_manager()
);


-- Modifica diretta consentita solamente ai gestori.

create policy loans_update
on public.loans
for update
to authenticated
using (
  public.is_loan_manager()
)
with check (
  public.is_loan_manager()
);


-- Eliminazione consentita solamente ai gestori.

create policy loans_delete
on public.loans
for delete
to authenticated
using (
  public.is_loan_manager()
);


-- =====================================================================
-- AGGIORNAMENTO ATOMICO DELLA DISPONIBILITÀ
-- =====================================================================

create or replace function public.equipment_shift_available(
  p_equipment_id bigint,
  p_delta integer
)
returns void
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_available integer;
  v_total integer;
  v_new_available integer;
begin

  select
    coalesce(quantity_available, quantity_total, 0),
    quantity_total
  into
    v_available,
    v_total
  from public.equipment
  where equipment_id = p_equipment_id
  for update;


  if not found then
    raise exception 'Materiale non trovato.'
      using errcode = 'P0002';
  end if;


  v_new_available :=
    v_available + coalesce(p_delta, 0);


  if v_new_available < 0 then
    raise exception
      'Disponibilità insufficiente per il materiale %. Disponibili: %.',
      p_equipment_id,
      v_available
      using errcode = 'P0001';
  end if;


  if v_total is not null
     and v_new_available > v_total then
    raise exception
      'La disponibilità non può superare la quantità totale.'
      using errcode = 'P0001';
  end if;


  update public.equipment
     set quantity_available = v_new_available
   where equipment_id = p_equipment_id;

end;
$$;


revoke all
on function public.equipment_shift_available(bigint, integer)
from public, anon, authenticated;


-- =====================================================================
-- TRIGGER DISPONIBILITÀ
-- =====================================================================
--
-- Quantità realmente indisponibile:
--
--   PRESTITO ATTIVO  → quantity
--   PRESTITO CHIUSO  → missing_quantity
--
-- Questo permette di gestire correttamente anche:
-- * riapertura di un prestito;
-- * correzione della quantità;
-- * cambio del materiale;
-- * modifica dei pezzi mancanti;
-- * eliminazione di prestiti chiusi.
-- =====================================================================


-- ---------------------------------------------------------------------
-- INSERT
-- ---------------------------------------------------------------------

create or replace function public.adjust_equipment_on_loan_insert()
returns trigger
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_unavailable integer;
begin

  v_unavailable :=
    case
      when new.status in ('in_corso', 'active')
        then coalesce(new.quantity, 0)
      else
        coalesce(new.missing_quantity, 0)
    end;


  if v_unavailable > 0 then
    perform public.equipment_shift_available(
      new.equipment_id,
      -v_unavailable
    );
  end if;


  return new;
end;
$$;


-- ---------------------------------------------------------------------
-- UPDATE
-- ---------------------------------------------------------------------

create or replace function public.adjust_equipment_on_loan_update()
returns trigger
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_old_unavailable integer;
  v_new_unavailable integer;
  v_delta integer;
begin

  v_old_unavailable :=
    case
      when old.status in ('in_corso', 'active')
        then coalesce(old.quantity, 0)
      else
        coalesce(old.missing_quantity, 0)
    end;


  v_new_unavailable :=
    case
      when new.status in ('in_corso', 'active')
        then coalesce(new.quantity, 0)
      else
        coalesce(new.missing_quantity, 0)
    end;


  -- Se cambia il materiale:
  -- rimuoviamo l'effetto dal vecchio materiale e
  -- applichiamo l'effetto al nuovo.

  if new.equipment_id is distinct from old.equipment_id then

    if v_old_unavailable > 0 then
      perform public.equipment_shift_available(
        old.equipment_id,
        v_old_unavailable
      );
    end if;


    if v_new_unavailable > 0 then
      perform public.equipment_shift_available(
        new.equipment_id,
        -v_new_unavailable
      );
    end if;


  else

    -- Stesso materiale:
    -- basta applicare la differenza fra vecchio e nuovo stato.

    v_delta :=
      v_old_unavailable - v_new_unavailable;


    if v_delta <> 0 then
      perform public.equipment_shift_available(
        new.equipment_id,
        v_delta
      );
    end if;

  end if;


  return new;
end;
$$;


-- ---------------------------------------------------------------------
-- DELETE
-- ---------------------------------------------------------------------

create or replace function public.adjust_equipment_on_loan_delete()
returns trigger
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_unavailable integer;
begin

  v_unavailable :=
    case
      when old.status in ('in_corso', 'active')
        then coalesce(old.quantity, 0)
      else
        coalesce(old.missing_quantity, 0)
    end;


  if v_unavailable > 0 then
    perform public.equipment_shift_available(
      old.equipment_id,
      v_unavailable
    );
  end if;


  return old;
end;
$$;


-- ---------------------------------------------------------------------
-- Ricreazione trigger
-- ---------------------------------------------------------------------

drop trigger if exists loans_adjust_equipment_insert
  on public.loans;

drop trigger if exists loans_adjust_equipment_update
  on public.loans;

drop trigger if exists loans_adjust_equipment_delete
  on public.loans;


create trigger loans_adjust_equipment_insert
after insert on public.loans
for each row
execute function public.adjust_equipment_on_loan_insert();


create trigger loans_adjust_equipment_update
after update of
  status,
  quantity,
  equipment_id,
  missing_quantity
on public.loans
for each row
execute function public.adjust_equipment_on_loan_update();


create trigger loans_adjust_equipment_delete
after delete on public.loans
for each row
execute function public.adjust_equipment_on_loan_delete();


-- =====================================================================
-- FUNZIONI CHIAMATE DALL'APP
-- =====================================================================


-- ---------------------------------------------------------------------
-- Creazione prestito
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
set row_security = off
as $$
declare
  v_email text :=
    coalesce(auth.jwt() ->> 'email', '');

  v_available integer;

  v_row public.loans;
begin

  if auth.uid() is null
     or public.current_user_role() is null then

    raise exception
      'Il tuo profilo non è ancora abilitato ai prestiti.'
      using errcode = '42501';

  end if;


  if p_quantity is null
     or p_quantity <= 0 then

    raise exception
      'La quantità deve essere maggiore di zero.'
      using errcode = '22023';

  end if;


  -- Blocca la riga del materiale:
  -- due utenti non possono prendere contemporaneamente
  -- gli stessi ultimi pezzi.

  select coalesce(
           quantity_available,
           quantity_total,
           0
         )
    into v_available
    from public.equipment
   where equipment_id = p_equipment_id
   for update;


  if not found then
    raise exception
      'Materiale non trovato.'
      using errcode = 'P0002';
  end if;


  if p_quantity > v_available then

    raise exception
      'Disponibili solo % pezzi di questo materiale.',
      v_available
      using errcode = 'P0001';

  end if;


  insert into public.loans (
    equipment_id,
    uscita_id,
    reserved_until,
    borrower_name,
    borrower_email,
    borrower_member_number,
    quantity,
    notes,
    status,
    delivered_at
  )
  values (
    p_equipment_id,
    nullif(p_uscita_id, ''),
    p_reserved_until,
    coalesce(
      nullif(trim(p_borrower_name), ''),
      v_email
    ),
    nullif(v_email, ''),
    p_borrower_member_number,
    p_quantity,
    nullif(trim(p_notes), ''),
    'in_corso',
    now()
  )
  returning *
  into v_row;


  return v_row;
end;
$$;


-- ---------------------------------------------------------------------
-- Restituzione prestito
-- ---------------------------------------------------------------------

create or replace function public.loan_return(
  p_loan_id uuid,
  p_missing_quantity integer default 0,
  p_missing_notes text default null
)
returns public.loans
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_email text :=
    coalesce(auth.jwt() ->> 'email', '');

  v_loan public.loans;

  v_missing integer :=
    coalesce(p_missing_quantity, 0);
begin

  if auth.uid() is null
     or public.current_user_role() is null then

    raise exception
      'Il tuo profilo non è abilitato.'
      using errcode = '42501';

  end if;


  select *
    into v_loan
    from public.loans
   where id = p_loan_id
   for update;


  if not found then
    raise exception
      'Prestito non trovato.'
      using errcode = 'P0002';
  end if;


  -- Un utente normale può chiudere solamente il proprio prestito.
  -- I gestori possono chiudere qualsiasi prestito.

  if not public.is_loan_manager()
     and (
       v_email = ''
       or (
         coalesce(v_loan.borrower_email, '') <> v_email
         and coalesce(v_loan.borrower_name, '') <> v_email
       )
     ) then

    raise exception
      'Puoi chiudere solo i tuoi prestiti.'
      using errcode = '42501';

  end if;


  if v_loan.status not in ('in_corso', 'active') then

    raise exception
      'Questo prestito è già chiuso.'
      using errcode = 'P0001';

  end if;


  if v_missing < 0
     or v_missing > v_loan.quantity then

    raise exception
      'I pezzi mancanti devono essere tra 0 e %.',
      v_loan.quantity
      using errcode = '22023';

  end if;


  update public.loans
     set status = 'chiuso',
         returned_at = now(),
         missing_quantity = v_missing,
         missing_notes =
           nullif(trim(p_missing_notes), '')
   where id = p_loan_id
  returning *
       into v_loan;


  return v_loan;
end;
$$;


-- =====================================================================
-- PERMESSI RPC
-- =====================================================================

revoke all
on function public.loan_create(
  bigint,
  integer,
  text,
  integer,
  text,
  date,
  text
)
from public, anon;


revoke all
on function public.loan_return(
  uuid,
  integer,
  text
)
from public, anon;


grant execute
on function public.loan_create(
  bigint,
  integer,
  text,
  integer,
  text,
  date,
  text
)
to authenticated;


grant execute
on function public.loan_return(
  uuid,
  integer,
  text
)
to authenticated;


-- =====================================================================
-- VERIFICHE CONSIGLIATE DOPO L'ESECUZIONE
-- =====================================================================
--
-- select
--   id,
--   equipment_id,
--   borrower_name,
--   borrower_email,
--   quantity,
--   missing_quantity,
--   status
-- from public.loans
-- order by delivered_at desc;
--
-- =====================================================================
