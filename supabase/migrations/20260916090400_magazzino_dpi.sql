-- =====================================================================
-- 05 · Magazzino: ispezioni, scadenze DPI, impostazioni condivise
-- ---------------------------------------------------------------------
-- * Colonne per link ispezione, note e scadenze DPI (prossima ispezione
--   e fine vita del dispositivo).
-- * Tabella app_settings: la cartella Drive delle ispezioni non è più
--   salvata nel singolo browser.
-- * equipment_restock(): rifornimento atomico (niente conteggi
--   calcolati su dati vecchi nel browser).
-- * Se lo staff cambia la quantità totale, la disponibilità si sposta
--   della stessa differenza, senza perdere i pezzi in prestito.
-- =====================================================================

alter table public.equipment
  add column if not exists notes text,
  add column if not exists inspection_url text,
  add column if not exists prossima_ispezione date,
  add column if not exists fine_vita date;

create index if not exists equipment_prossima_ispezione_idx on public.equipment (prossima_ispezione);
create index if not exists equipment_fine_vita_idx on public.equipment (fine_vita);

create table if not exists public.app_settings (
  key text primary key,
  value text,
  updated_at timestamptz not null default now(),
  updated_by uuid
);

alter table public.app_settings enable row level security;

drop policy if exists app_settings_select on public.app_settings;
drop policy if exists app_settings_write on public.app_settings;

create policy app_settings_select on public.app_settings
for select to authenticated
using (public.current_user_role() is not null);

create policy app_settings_write on public.app_settings
for all to authenticated
using (public.has_any_role(array['admin', 'presidente', 'magazziniere']))
with check (public.has_any_role(array['admin', 'presidente', 'magazziniere']));

create or replace function public.equipment_keep_borrowed_on_total_change()
returns trigger
language plpgsql
as $$
begin
  if new.quantity_total is distinct from old.quantity_total
     and new.quantity_available is not distinct from old.quantity_available then
    new.quantity_available := greatest(
      coalesce(old.quantity_available, old.quantity_total, 0)
        + (coalesce(new.quantity_total, 0) - coalesce(old.quantity_total, 0)),
      0
    );
  end if;
  return new;
end;
$$;

drop trigger if exists equipment_keep_borrowed_on_total_change on public.equipment;
create trigger equipment_keep_borrowed_on_total_change
before update of quantity_total on public.equipment
for each row execute function public.equipment_keep_borrowed_on_total_change();

create or replace function public.equipment_restock(
  p_equipment_id bigint,
  p_quantity integer,
  p_increase_total boolean,
  p_note text default null
)
returns public.equipment
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.equipment;
begin
  if not public.has_any_role(array['admin', 'presidente', 'magazziniere']) then
    raise exception 'Non hai i permessi per rifornire il magazzino.' using errcode = '42501';
  end if;
  if p_quantity is null or p_quantity <= 0 then
    raise exception 'La quantità deve essere maggiore di zero.' using errcode = '22023';
  end if;

  update public.equipment
     set quantity_total = case
           when p_increase_total then coalesce(quantity_total, 0) + p_quantity
           else quantity_total
         end,
         quantity_available = case
           when p_increase_total then coalesce(quantity_available, quantity_total, 0) + p_quantity
           else least(
             coalesce(quantity_available, quantity_total, 0) + p_quantity,
             coalesce(quantity_total, coalesce(quantity_available, 0) + p_quantity)
           )
         end,
         notes = case
           when nullif(trim(p_note), '') is null then notes
           when coalesce(notes, '') = '' then trim(p_note)
           else notes || E'\n' || trim(p_note)
         end
   where equipment_id = p_equipment_id
  returning * into v_row;

  if v_row.equipment_id is null then
    raise exception 'Materiale non trovato.' using errcode = 'P0002';
  end if;

  return v_row;
end;
$$;

revoke all on function public.equipment_restock(bigint, integer, boolean, text) from public, anon;
grant execute on function public.equipment_restock(bigint, integer, boolean, text) to authenticated;
