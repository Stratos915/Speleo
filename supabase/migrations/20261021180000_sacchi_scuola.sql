-- =====================================================================
-- 19 · Materiale della scuola: sacchi dei corsisti
-- ---------------------------------------------------------------------
-- Una «cartella» del magazzino riservata alla scuola, divisa per numero
-- di sacco. Ogni sacco può essere consegnato a un corsista e contiene un
-- elenco di pezzi, ognuno con il suo link alla scheda d'ispezione (Drive),
-- matricola, prossima ispezione e fine vita.
--
-- * scuola_sacchi           un sacco: numero, a chi è consegnato e quando, note
-- * scuola_sacchi_materiale i pezzi dentro un sacco
--
-- Chi la vede: tutti tranne i soci semplici (admin, presidente, consiglio,
-- segretario, tesoriere, magazziniere, direttore scuola), come la pagina
-- Scuola. Chi la modifica: admin, presidente, magazziniere e direttore scuola.
-- Contano anche i ruoli «in più» (has_any_role, migrazione 14).
--
-- Il resto del magazzino (tabella equipment) non cambia.
-- Script idempotente.
-- =====================================================================

create table if not exists public.scuola_sacchi (
  id uuid primary key default gen_random_uuid(),
  numero integer not null,
  consegnato_a text,
  consegnato_il date,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint scuola_sacchi_numero_positivo check (numero > 0),
  constraint scuola_sacchi_numero_unico unique (numero)
);

create table if not exists public.scuola_sacchi_materiale (
  id uuid primary key default gen_random_uuid(),
  sacco_id uuid not null references public.scuola_sacchi (id) on delete cascade,
  nome text not null,
  quantita integer not null default 1,
  matricola text,
  scheda_url text,
  prossima_ispezione date,
  fine_vita date,
  note text,
  posizione integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint scuola_sacchi_materiale_nome check (length(btrim(nome)) > 0),
  constraint scuola_sacchi_materiale_quantita check (quantita > 0),
  constraint scuola_sacchi_materiale_scheda check (scheda_url is null or scheda_url ~* '^https?://')
);

create index if not exists scuola_sacchi_materiale_sacco_idx
  on public.scuola_sacchi_materiale (sacco_id, posizione);

-- Aggiorna updated_at a ogni modifica.
create or replace function public.scuola_sacchi_touch()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists scuola_sacchi_touch on public.scuola_sacchi;
create trigger scuola_sacchi_touch
  before update on public.scuola_sacchi
  for each row execute function public.scuola_sacchi_touch();

drop trigger if exists scuola_sacchi_materiale_touch on public.scuola_sacchi_materiale;
create trigger scuola_sacchi_materiale_touch
  before update on public.scuola_sacchi_materiale
  for each row execute function public.scuola_sacchi_touch();


-- ---------------------------------------------------------------------
-- Permessi
-- ---------------------------------------------------------------------

alter table public.scuola_sacchi enable row level security;
alter table public.scuola_sacchi_materiale enable row level security;

revoke all on public.scuola_sacchi from anon;
revoke all on public.scuola_sacchi_materiale from anon;
grant select, insert, update, delete on public.scuola_sacchi to authenticated;
grant select, insert, update, delete on public.scuola_sacchi_materiale to authenticated;

drop policy if exists scuola_sacchi_select on public.scuola_sacchi;
create policy scuola_sacchi_select on public.scuola_sacchi
for select to authenticated
using (
  public.has_any_role(array[
    'admin', 'presidente', 'consiglio', 'segretario',
    'tesoriere', 'magazziniere', 'direttore_scuola'
  ])
);

drop policy if exists scuola_sacchi_write on public.scuola_sacchi;
create policy scuola_sacchi_write on public.scuola_sacchi
for all to authenticated
using (public.has_any_role(array['admin', 'presidente', 'magazziniere', 'direttore_scuola']))
with check (public.has_any_role(array['admin', 'presidente', 'magazziniere', 'direttore_scuola']));

drop policy if exists scuola_sacchi_materiale_select on public.scuola_sacchi_materiale;
create policy scuola_sacchi_materiale_select on public.scuola_sacchi_materiale
for select to authenticated
using (
  public.has_any_role(array[
    'admin', 'presidente', 'consiglio', 'segretario',
    'tesoriere', 'magazziniere', 'direttore_scuola'
  ])
);

drop policy if exists scuola_sacchi_materiale_write on public.scuola_sacchi_materiale;
create policy scuola_sacchi_materiale_write on public.scuola_sacchi_materiale
for all to authenticated
using (public.has_any_role(array['admin', 'presidente', 'magazziniere', 'direttore_scuola']))
with check (public.has_any_role(array['admin', 'presidente', 'magazziniere', 'direttore_scuola']));
