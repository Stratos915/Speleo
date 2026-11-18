-- =====================================================================
-- 23 · Materiale ACAR ai corsisti
-- ---------------------------------------------------------------------
-- Con la migrazione 22 un prestito ACAR non ricordava corso e corsista
-- (lo faceva solo il sacco della scuola). Ora anche il materiale ACAR
-- consegnato a un corsista resta collegato al suo corso e alla sua
-- scheda nella pagina Scuola.
--
-- Cambia solo la funzione loan_create_speciale: nessuna tabella nuova,
-- nessun dato toccato. Regole invariate (chi presta l'ACAR, revisione
-- scaduta, un solo prestito aperto per pezzo).
-- Richiede la migrazione 22. Script idempotente: si può rieseguire.
-- =====================================================================

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
      acar_id, materiale_nome, uscita_id, corso_rif, corso_nome, corsista_rif, reserved_until,
      borrower_name, borrower_email, borrower_member_number, quantity, notes, status, delivered_at
    ) values (
      p_item_id, v_nome, nullif(p_uscita_id, ''), nullif(p_corso_rif, ''), nullif(trim(p_corso_nome), ''),
      nullif(p_corsista_rif, ''), p_reserved_until, v_nome_ricevente, null, p_borrower_member_number,
      1, nullif(trim(p_notes), ''), 'in_corso', now()
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
