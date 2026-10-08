-- =====================================================================
-- 09 · Adesioni alle uscite (partecipo / forse / non partecipo)
-- ---------------------------------------------------------------------
-- Ogni socio collegato può indicare se parteciperà a un'uscita.
--
-- * La risposta è legata all'account (profiles.id), non alla scheda
--   socio: molti profili non hanno ancora member_id collegato.
-- * Ognuno può scrivere, modificare o ritirare solo la propria risposta.
-- * Sulle uscite chiuse le risposte non si possono più cambiare.
-- * Tutti i profili approvati vedono le risposte; i nomi di chi ha
--   risposto arrivano dalla funzione uscita_adesioni(), che espone solo
--   nome e risposta (non email o telefono).
-- * L'elenco "Partecipanti" compilato dal responsabile
--   (uscite.participants_ids) resta invariato: le adesioni sono le
--   intenzioni dichiarate prima dell'uscita, i partecipanti sono chi
--   è effettivamente andato.
--
-- Richiede la migrazione 01 (current_user_role).
-- Script idempotente.
-- =====================================================================


-- ---------------------------------------------------------------------
-- Tabella
-- ---------------------------------------------------------------------

create table if not exists public.uscite_partecipazioni (
  uscita_id  uuid not null references public.uscite (id) on delete cascade,
  user_id    uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  risposta   text not null check (risposta in ('si', 'forse', 'no')),
  nota       text check (nota is null or char_length(nota) <= 280),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (uscita_id, user_id)
);

create index if not exists uscite_partecipazioni_user_idx
  on public.uscite_partecipazioni (user_id);


-- updated_at automatico

create or replace function public.uscite_partecipazioni_touch()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists uscite_partecipazioni_touch on public.uscite_partecipazioni;
create trigger uscite_partecipazioni_touch
before update on public.uscite_partecipazioni
for each row execute function public.uscite_partecipazioni_touch();


-- ---------------------------------------------------------------------
-- Regole di accesso
-- ---------------------------------------------------------------------

alter table public.uscite_partecipazioni enable row level security;

drop policy if exists uscite_partecipazioni_select on public.uscite_partecipazioni;
drop policy if exists uscite_partecipazioni_insert on public.uscite_partecipazioni;
drop policy if exists uscite_partecipazioni_update on public.uscite_partecipazioni;
drop policy if exists uscite_partecipazioni_delete on public.uscite_partecipazioni;


-- Lettura: tutti i profili approvati.

create policy uscite_partecipazioni_select on public.uscite_partecipazioni
for select to authenticated
using (public.current_user_role() is not null);


-- Scrittura: solo la propria risposta, da profilo approvato,
-- su un'uscita non chiusa.

create policy uscite_partecipazioni_insert on public.uscite_partecipazioni
for insert to authenticated
with check (
  user_id = auth.uid()
  and public.current_user_role() is not null
  and exists (
    select 1 from public.uscite u
     where u.id = uscita_id
       and u.status is distinct from 'chiusa'
  )
);

create policy uscite_partecipazioni_update on public.uscite_partecipazioni
for update to authenticated
using (user_id = auth.uid() and public.current_user_role() is not null)
with check (
  user_id = auth.uid()
  and exists (
    select 1 from public.uscite u
     where u.id = uscita_id
       and u.status is distinct from 'chiusa'
  )
);

create policy uscite_partecipazioni_delete on public.uscite_partecipazioni
for delete to authenticated
using (
  user_id = auth.uid()
  and exists (
    select 1 from public.uscite u
     where u.id = uscita_id
       and u.status is distinct from 'chiusa'
  )
);


-- ---------------------------------------------------------------------
-- Elenco adesioni con nome, per la scheda dell'uscita
-- ---------------------------------------------------------------------
-- Nome mostrato: nome e cognome del profilo, altrimenti il nome della
-- scheda socio collegata, altrimenti la parte dell'email prima della @.

create or replace function public.uscita_adesioni(p_uscita uuid)
returns table (
  user_id    uuid,
  nome       text,
  risposta   text,
  nota       text,
  updated_at timestamptz
)
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select
    p.user_id,
    coalesce(
      nullif(trim(concat_ws(' ', pr.first_name, pr.last_name)), ''),
      nullif(trim(m.full_name), ''),
      split_part(pr.email, '@', 1),
      'Socio'
    ) as nome,
    p.risposta,
    p.nota,
    p.updated_at
  from public.uscite_partecipazioni p
  join public.profiles pr on pr.id = p.user_id
  left join public.members m on m.id = pr.member_id
  where p.uscita_id = p_uscita
    and public.current_user_role() is not null
  order by
    case p.risposta when 'si' then 0 when 'forse' then 1 else 2 end,
    nome;
$$;

revoke all on function public.uscita_adesioni(uuid) from public, anon;
grant execute on function public.uscita_adesioni(uuid) to authenticated;


-- =====================================================================
-- VERIFICA DOPO L'ESECUZIONE
-- =====================================================================
--
-- select policyname, cmd, roles
--   from pg_policies
--  where tablename = 'uscite_partecipazioni'
--  order by policyname;
--
-- select * from public.uscita_adesioni('<id uscita>');
--
-- =====================================================================
