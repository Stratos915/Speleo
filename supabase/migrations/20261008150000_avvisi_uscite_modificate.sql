-- =====================================================================
-- 10 · Avvisi per uscite modificate o annullate
-- ---------------------------------------------------------------------
-- La tabella uscite non tiene traccia delle modifiche e una riga
-- cancellata sparisce: il job non potrebbe accorgersene. Qui un trigger
-- annota in uscite_modifiche:
--   * 'modificata' quando cambiano titolo, data, ora, luogo o tipo;
--   * 'annullata'  quando un'uscita viene eliminata.
-- Il job notification-cron legge queste righe e avvisa i soci.
--
-- Sicurezza per la sezione Uscite: il trigger non blocca MAI il
-- salvataggio. Se l'annotazione fallisce, l'errore diventa un semplice
-- avviso nel log del database e la modifica dell'uscita va a buon fine.
--
-- Script idempotente. Richiede la migrazione 09.
-- =====================================================================

create table if not exists public.uscite_modifiche (
  id         bigint generated always as identity primary key,
  uscita_id  uuid not null,
  tipo       text not null check (tipo in ('modificata', 'annullata')),
  prima      jsonb not null,
  dopo       jsonb,
  autore     uuid default auth.uid(),
  created_at timestamptz not null default now()
);

create index if not exists uscite_modifiche_created_idx on public.uscite_modifiche (created_at);

-- Solo il job (chiave di servizio) legge e scrive: nessuna policy per il browser.
alter table public.uscite_modifiche enable row level security;
revoke all on public.uscite_modifiche from anon, authenticated;


create or replace function public.uscite_annota_modifica()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  begin
    if tg_op = 'DELETE' then
      insert into public.uscite_modifiche (uscita_id, tipo, prima)
      values (
        old.id,
        'annullata',
        jsonb_build_object(
          'titolo', old.titolo, 'data', old.data, 'ora', old.ora, 'luogo', old.luogo,
          'tipo', old.tipo, 'status', old.status, 'created_at', old.created_at
        )
      );
      return old;
    end if;

    if (new.titolo, new.data, new.ora, new.luogo, new.tipo)
       is distinct from (old.titolo, old.data, old.ora, old.luogo, old.tipo) then
      insert into public.uscite_modifiche (uscita_id, tipo, prima, dopo)
      values (
        new.id,
        'modificata',
        jsonb_build_object('titolo', old.titolo, 'data', old.data, 'ora', old.ora, 'luogo', old.luogo, 'tipo', old.tipo),
        jsonb_build_object('titolo', new.titolo, 'data', new.data, 'ora', new.ora, 'luogo', new.luogo, 'tipo', new.tipo)
      );
    end if;
  exception when others then
    raise warning 'uscite_annota_modifica: %', sqlerrm;
  end;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

revoke all on function public.uscite_annota_modifica() from public, anon, authenticated;

drop trigger if exists uscite_annota_modifica on public.uscite;
create trigger uscite_annota_modifica
after update or delete on public.uscite
for each row execute function public.uscite_annota_modifica();


-- =====================================================================
-- VERIFICA DOPO L'ESECUZIONE
-- =====================================================================
--
-- select trigger_name, string_agg(event_manipulation, ',')
--   from information_schema.triggers
--  where event_object_table = 'uscite' group by 1;
--
-- select tipo, uscita_id, created_at from public.uscite_modifiche
--  order by created_at desc limit 10;
--
-- =====================================================================
