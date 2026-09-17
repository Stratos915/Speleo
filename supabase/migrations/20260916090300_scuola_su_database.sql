-- =====================================================================
-- 04 · Dati della Scuola su database
-- ---------------------------------------------------------------------
-- Prima corsi, corsisti, registro istruttori e materiale didattico
-- erano salvati solo nel browser di chi li inseriva. Ora:
-- * i dati sono in public.scuola_dati (un documento condiviso);
-- * i salvataggi usano un numero di versione per evitare che due
--   persone si sovrascrivano a vicenda;
-- * i file vanno nel bucket privato "scuola-documenti".
-- =====================================================================

create table if not exists public.scuola_dati (
  id text primary key default 'principale',
  data jsonb not null default '{}'::jsonb,
  version integer not null default 1,
  updated_at timestamptz not null default now(),
  updated_by uuid,
  updated_by_email text
);

alter table public.scuola_dati enable row level security;

drop policy if exists scuola_dati_select on public.scuola_dati;
create policy scuola_dati_select on public.scuola_dati
for select to authenticated
using (
  public.has_any_role(array[
    'admin', 'presidente', 'consiglio', 'segretario',
    'tesoriere', 'magazziniere', 'direttore_scuola'
  ])
);
-- Nessuna policy di scrittura: si scrive solo tramite scuola_salva().

create or replace function public.scuola_salva(p_data jsonb, p_expected_version integer)
returns public.scuola_dati
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.scuola_dati;
begin
  if not public.has_any_role(array['admin', 'presidente', 'direttore_scuola']) then
    raise exception 'Solo il direttore della scuola o gli amministratori possono modificare i dati.'
      using errcode = '42501';
  end if;

  if p_data is null or jsonb_typeof(p_data) <> 'object' then
    raise exception 'Dati non validi.' using errcode = '22023';
  end if;

  insert into public.scuola_dati as s (id, data, version, updated_at, updated_by, updated_by_email)
  values ('principale', p_data, 1, now(), auth.uid(), auth.jwt() ->> 'email')
  on conflict (id) do update
     set data = excluded.data,
         version = s.version + 1,
         updated_at = now(),
         updated_by = excluded.updated_by,
         updated_by_email = excluded.updated_by_email
   where s.version = coalesce(p_expected_version, 0)
  returning * into v_row;

  if v_row.id is null then
    -- PT409: PostgREST risponde con HTTP 409 (conflitto)
    raise exception 'Qualcun altro ha modificato i dati della scuola. Ricarica la pagina.'
      using errcode = 'PT409';
  end if;

  return v_row;
end;
$$;

revoke all on function public.scuola_salva(jsonb, integer) from public, anon;
grant execute on function public.scuola_salva(jsonb, integer) to authenticated;

-- Bucket privato per dispense, moduli e documenti del registro istruttori
insert into storage.buckets (id, name, public)
values ('scuola-documenti', 'scuola-documenti', false)
on conflict (id) do nothing;

drop policy if exists scuola_documenti_select on storage.objects;
drop policy if exists scuola_documenti_insert on storage.objects;
drop policy if exists scuola_documenti_delete on storage.objects;

create policy scuola_documenti_select on storage.objects
for select to authenticated
using (
  bucket_id = 'scuola-documenti'
  and public.has_any_role(array[
    'admin', 'presidente', 'consiglio', 'segretario',
    'tesoriere', 'magazziniere', 'direttore_scuola'
  ])
);

create policy scuola_documenti_insert on storage.objects
for insert to authenticated
with check (
  bucket_id = 'scuola-documenti'
  and public.has_any_role(array['admin', 'presidente', 'direttore_scuola'])
);

create policy scuola_documenti_delete on storage.objects
for delete to authenticated
using (
  bucket_id = 'scuola-documenti'
  and public.has_any_role(array['admin', 'presidente', 'direttore_scuola'])
);
