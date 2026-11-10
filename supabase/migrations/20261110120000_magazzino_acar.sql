-- =====================================================================
-- 20 · Magazzino ACAR (autorespiratori)
-- ---------------------------------------------------------------------
-- Un'area del magazzino per il materiale ACAR: bombole, erogatori,
-- maschere (e altro). Per ogni pezzo:
--   tipo                 bombola, erogatore, maschera, altro
--   descrizione          marca / modello
--   matricola            matricola o numero di serie
--   tipologia            solo bombole: composito o acciaio
--   capacita_litri       solo bombole (es. 7, 10, 12)
--   pressione_bar        solo bombole: pressione di esercizio (es. 200, 300)
--   percentuale_ossigeno solo bombole: % di ossigeno della miscela (21 = aria)
--   scadenza_revisione   data entro cui va fatta la revisione
--   scheda_url           link al certificato / scheda di revisione (Drive)
--   note
--
-- Chi la vede: tutti i soci approvati, come il resto del magazzino.
-- Chi la modifica: admin, presidente e magazziniere (anche come ruolo in più).
-- Il resto del magazzino (tabella equipment) non cambia.
-- Script idempotente.
-- =====================================================================

create table if not exists public.acar_materiale (
  id uuid primary key default gen_random_uuid(),
  tipo text not null default 'bombola',
  descrizione text,
  matricola text,
  tipologia text,
  capacita_litri numeric(5, 1),
  pressione_bar integer,
  percentuale_ossigeno numeric(4, 1),
  scadenza_revisione date,
  scheda_url text,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint acar_materiale_tipo check (tipo in ('bombola', 'erogatore', 'maschera', 'altro')),
  constraint acar_materiale_tipologia check (tipologia is null or tipologia in ('composito', 'acciaio')),
  constraint acar_materiale_capacita check (capacita_litri is null or capacita_litri > 0),
  constraint acar_materiale_pressione check (pressione_bar is null or pressione_bar > 0),
  constraint acar_materiale_ossigeno check (
    percentuale_ossigeno is null or (percentuale_ossigeno > 0 and percentuale_ossigeno <= 100)
  ),
  constraint acar_materiale_scheda check (scheda_url is null or scheda_url ~* '^https?://')
);

create index if not exists acar_materiale_tipo_idx on public.acar_materiale (tipo);
create index if not exists acar_materiale_revisione_idx on public.acar_materiale (scadenza_revisione);

-- Aggiorna updated_at a ogni modifica.
create or replace function public.acar_materiale_touch()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists acar_materiale_touch on public.acar_materiale;
create trigger acar_materiale_touch
  before update on public.acar_materiale
  for each row execute function public.acar_materiale_touch();


-- ---------------------------------------------------------------------
-- Permessi
-- ---------------------------------------------------------------------

alter table public.acar_materiale enable row level security;

revoke all on public.acar_materiale from anon;
grant select, insert, update, delete on public.acar_materiale to authenticated;

drop policy if exists acar_materiale_select on public.acar_materiale;
create policy acar_materiale_select on public.acar_materiale
for select to authenticated
using (
  public.has_any_role(array[
    'admin', 'presidente', 'consiglio', 'segretario',
    'tesoriere', 'magazziniere', 'direttore_scuola', 'socio'
  ])
);

drop policy if exists acar_materiale_write on public.acar_materiale;
create policy acar_materiale_write on public.acar_materiale
for all to authenticated
using (public.has_any_role(array['admin', 'presidente', 'magazziniere']))
with check (public.has_any_role(array['admin', 'presidente', 'magazziniere']));
