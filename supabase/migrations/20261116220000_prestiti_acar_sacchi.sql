-- =====================================================================
-- 22 · Prestiti del materiale ACAR e dei sacchi della scuola
-- ---------------------------------------------------------------------
-- Finora un prestito era sempre di materiale del magazzino generale
-- (tabella equipment). Ora può essere anche:
--   * un pezzo del Magazzino ACAR (bombola, erogatore, maschera…)
--   * un sacco della scuola, consegnato a un corsista o a un socio
--
-- Ogni prestito può essere collegato a un'uscita (es. uscita ACAR, uscita
-- del corso) e, per i sacchi, al corso e al corsista che lo prende.
--
-- Nuove colonne di loans:
--   acar_id        pezzo ACAR prestato
--   sacco_id       sacco della scuola prestato
--   materiale_nome nome leggibile salvato al momento del prestito
--                  (es. «Bombola Faber 10 L · matr. 123», «Sacco scuola n° 4»)
--   corso_rif      corso della scuola («idAnno::idCorso»)
--   corso_nome     nome del corso (es. «Corso 2026 · Anno 2026»)
--   corsista_rif   corsista del corso, se il sacco va a un corsista
--
-- Regole:
--   * un pezzo ACAR o un sacco può avere un solo prestito aperto alla volta;
--   * un pezzo ACAR con la revisione scaduta non si presta;
--   * prestano e ritirano il materiale ACAR admin, presidente e magazziniere;
--     i sacchi anche il direttore scuola;
--   * prestando un sacco si compila da solo «consegnato a / il» del sacco,
--     al rientro si svuota.
--
-- Il magazzino generale e i suoi prestiti non cambiano.
-- Script idempotente: si può eseguire più volte.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. Colonne nuove
-- ---------------------------------------------------------------------

alter table public.loans add column if not exists acar_id uuid;
alter table public.loans add column if not exists sacco_id uuid;
alter table public.loans add column if not exists materiale_nome text;
alter table public.loans add column if not exists corso_rif text;
alter table public.loans add column if not exists corso_nome text;
alter table public.loans add column if not exists corsista_rif text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'loans_acar_id_fkey') then
    alter table public.loans
      add constraint loans_acar_id_fkey foreign key (acar_id)
      references public.acar_materiale (id) on delete restrict;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'loans_sacco_id_fkey') then
    alter table public.loans
      add constraint loans_sacco_id_fkey foreign key (sacco_id)
      references public.scuola_sacchi (id) on delete restrict;
  end if;
  -- Un prestito riguarda una sola cosa: materiale generale, pezzo ACAR o sacco.
  if not exists (select 1 from pg_constraint where conname = 'loans_un_solo_materiale') then
    alter table public.loans
      add constraint loans_un_solo_materiale
      check (num_nonnulls(equipment_id, acar_id, sacco_id) = 1);
  end if;
end;
$$;

-- Un solo prestito aperto per pezzo ACAR e per sacco.
create unique index if not exists loans_acar_aperto_unico
  on public.loans (acar_id) where acar_id is not null and status in ('in_corso', 'active');
create unique index if not exists loans_sacco_aperto_unico
  on public.loans (sacco_id) where sacco_id is not null and status in ('in_corso', 'active');
create index if not exists loans_uscita_idx on public.loans (uscita_id);


-- ---------------------------------------------------------------------
-- 2. Disponibilità del magazzino generale: ignora i prestiti ACAR e sacchi
-- ---------------------------------------------------------------------
-- I trigger dei prestiti aggiornano la quantità disponibile del materiale
-- generale; per un prestito senza equipment_id non c'è nulla da aggiornare.

create or replace function public.equipment_shift_available(p_equipment_id bigint, p_delta integer)
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
  if p_equipment_id is null then
    return;
  end if;

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
    raise exception 'Materiale non trovato.' using errcode = 'P0002';
  end if;

  v_new_available := v_available + coalesce(p_delta, 0);

  if v_new_available < 0 then
    raise exception
      'Disponibilità insufficiente per il materiale %. Disponibili: %.',
      p_equipment_id, v_available
      using errcode = 'P0001';
  end if;

  if v_total is not null and v_new_available > v_total then
    v_new_available := v_total;
  end if;

  update public.equipment
     set quantity_available = v_new_available
   where equipment_id = p_equipment_id;
end;
$$;


-- ---------------------------------------------------------------------
-- 3. Nuovo prestito di un pezzo ACAR o di un sacco
-- ---------------------------------------------------------------------
-- p_tipo: 'acar' oppure 'sacco'

create or replace function public.loan_create_speciale(
  p_tipo text,
  p_item_id uuid,
  p_borrower_name text,
  p_borrower_member_number integer default null,
  p_uscita_id text default null,
  p_corso_rif text default null,
  p_corso_nome text default null,
  p_corsista_rif text default null,
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
  v_nome_ricevente text := nullif(trim(coalesce(p_borrower_name, '')), '');
  v_acar public.acar_materiale;
  v_sacco public.scuola_sacchi;
  v_nome text;
  v_row public.loans;
begin
  if auth.uid() is null or public.current_user_role() is null then
    raise exception 'Il tuo profilo non è ancora abilitato ai prestiti.' using errcode = '42501';
  end if;

  if v_nome_ricevente is null then
    raise exception 'Indica a chi va il materiale.' using errcode = '22023';
  end if;

  if p_tipo = 'acar' then
    if not public.has_any_role(array['admin', 'presidente', 'magazziniere']) then
      raise exception 'Il materiale ACAR lo prestano admin, presidente e magazziniere.' using errcode = '42501';
    end if;

    select * into v_acar from public.acar_materiale where id = p_item_id for update;
    if not found then
      raise exception 'Pezzo ACAR non trovato.' using errcode = 'P0002';
    end if;
    if v_acar.scadenza_revisione is not null and v_acar.scadenza_revisione < current_date then
      raise exception 'Revisione scaduta il %: questo pezzo non si può prestare.',
        to_char(v_acar.scadenza_revisione, 'DD/MM/YYYY') using errcode = 'P0001';
    end if;
    if exists (
      select 1 from public.loans
       where acar_id = p_item_id and status in ('in_corso', 'active')
    ) then
      raise exception 'Questo pezzo ACAR è già in prestito.' using errcode = 'P0001';
    end if;

    v_nome := concat_ws(' · ',
      initcap(v_acar.tipo) || coalesce(' ' || nullif(trim(v_acar.descrizione), ''), ''),
      case when v_acar.matricola is not null and trim(v_acar.matricola) <> ''
           then 'matr. ' || trim(v_acar.matricola) end
    );

    insert into public.loans (
      acar_id, materiale_nome, uscita_id, reserved_until, borrower_name, borrower_email,
      borrower_member_number, quantity, notes, status, delivered_at
    ) values (
      p_item_id, v_nome, nullif(p_uscita_id, ''), p_reserved_until, v_nome_ricevente, null,
      p_borrower_member_number, 1, nullif(trim(p_notes), ''), 'in_corso', now()
    )
    returning * into v_row;

  elsif p_tipo = 'sacco' then
    if not public.has_any_role(array['admin', 'presidente', 'magazziniere', 'direttore_scuola']) then
      raise exception 'I sacchi della scuola li consegnano admin, presidente, magazziniere e direttore scuola.'
        using errcode = '42501';
    end if;

    select * into v_sacco from public.scuola_sacchi where id = p_item_id for update;
    if not found then
      raise exception 'Sacco non trovato.' using errcode = 'P0002';
    end if;
    if exists (
      select 1 from public.loans
       where sacco_id = p_item_id and status in ('in_corso', 'active')
    ) then
      raise exception 'Il sacco n° % è già consegnato.', v_sacco.numero using errcode = 'P0001';
    end if;

    v_nome := 'Sacco scuola n° ' || v_sacco.numero;

    insert into public.loans (
      sacco_id, materiale_nome, uscita_id, corso_rif, corso_nome, corsista_rif, reserved_until,
      borrower_name, borrower_email, borrower_member_number, quantity, notes, status, delivered_at
    ) values (
      p_item_id, v_nome, nullif(p_uscita_id, ''), nullif(p_corso_rif, ''), nullif(trim(p_corso_nome), ''),
      nullif(p_corsista_rif, ''), p_reserved_until, v_nome_ricevente, null, p_borrower_member_number,
      1, nullif(trim(p_notes), ''), 'in_corso', now()
    )
    returning * into v_row;

    update public.scuola_sacchi
       set consegnato_a = v_nome_ricevente,
           consegnato_il = current_date
     where id = p_item_id;

  else
    raise exception 'Tipo di prestito non valido.' using errcode = '22023';
  end if;

  return v_row;
end;
$$;

revoke all on function public.loan_create_speciale(text, uuid, text, integer, text, text, text, text, date, text) from public, anon;
grant execute on function public.loan_create_speciale(text, uuid, text, integer, text, text, text, text, date, text) to authenticated;


-- ---------------------------------------------------------------------
-- 4. Rientro: anche il direttore scuola per i sacchi; il sacco torna libero
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
     and not (v_loan.sacco_id is not null and public.has_any_role(array['direttore_scuola']))
     and (
       v_email = ''
       or (
         coalesce(v_loan.borrower_email, '') <> v_email
         and coalesce(v_loan.borrower_name, '') <> v_email
       )
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

  if v_loan.sacco_id is not null then
    update public.scuola_sacchi
       set consegnato_a = null,
           consegnato_il = null
     where id = v_loan.sacco_id;
  end if;

  return v_loan;
end;
$$;


-- ---------------------------------------------------------------------
-- 5. Chi vede i prestiti dei sacchi: anche il direttore scuola
-- ---------------------------------------------------------------------

drop policy if exists loans_select on public.loans;
create policy loans_select on public.loans
for select to authenticated
using (
  public.is_loan_manager()
  or (sacco_id is not null and public.has_any_role(array['direttore_scuola']))
  or (
    public.current_user_role() is not null
    and (
      borrower_email = coalesce(auth.jwt() ->> 'email', '')
      or borrower_name = coalesce(auth.jwt() ->> 'email', '')
    )
  )
);
