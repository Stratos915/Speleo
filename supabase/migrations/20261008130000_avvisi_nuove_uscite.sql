-- =====================================================================
-- 09 · Avvisi ai soci per le nuove uscite (email e notifiche push)
-- ---------------------------------------------------------------------
-- * notifica_preferenze: ogni socio sceglie se ricevere email e/o
--   notifiche sul dispositivo. Senza riga valgono entrambe "sì".
-- * push_subscriptions: un'iscrizione per ogni browser/dispositivo su cui
--   il socio ha attivato le notifiche. Le scrive solo il socio stesso,
--   tramite le funzioni push_registra / push_rimuovi.
-- * app_private_config: valori riservati al job (chiavi VAPID, modalità
--   di prova). RLS attiva e nessuna policy: dal browser non si legge né
--   si scrive nulla; la usa solo il job con la chiave di servizio.
--
-- Il job notification-cron (controllo NUOVA_USCITA) legge queste tabelle
-- e invia gli avvisi. La sezione Uscite non viene modificata.
--
-- Richiede la migrazione 01 (current_user_role).
-- Script idempotente.
-- =====================================================================


-- ---------------------------------------------------------------------
-- Preferenze
-- ---------------------------------------------------------------------

create table if not exists public.notifica_preferenze (
  user_id    uuid primary key default auth.uid() references public.profiles (id) on delete cascade,
  email      boolean not null default true,
  push       boolean not null default true,
  updated_at timestamptz not null default now()
);

alter table public.notifica_preferenze enable row level security;

drop policy if exists notifica_preferenze_select on public.notifica_preferenze;
drop policy if exists notifica_preferenze_insert on public.notifica_preferenze;
drop policy if exists notifica_preferenze_update on public.notifica_preferenze;

create policy notifica_preferenze_select on public.notifica_preferenze
for select to authenticated
using (user_id = auth.uid());

create policy notifica_preferenze_insert on public.notifica_preferenze
for insert to authenticated
with check (user_id = auth.uid() and public.current_user_role() is not null);

create policy notifica_preferenze_update on public.notifica_preferenze
for update to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());


-- ---------------------------------------------------------------------
-- Iscrizioni push (una per dispositivo)
-- ---------------------------------------------------------------------

create table if not exists public.push_subscriptions (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.profiles (id) on delete cascade,
  endpoint     text not null unique,
  p256dh       text not null,
  auth         text not null,
  user_agent   text,
  created_at   timestamptz not null default now(),
  last_used_at timestamptz
);

create index if not exists push_subscriptions_user_idx on public.push_subscriptions (user_id);

alter table public.push_subscriptions enable row level security;

drop policy if exists push_subscriptions_select on public.push_subscriptions;

-- Il socio vede solo i propri dispositivi; le scritture passano dalle funzioni.
create policy push_subscriptions_select on public.push_subscriptions
for select to authenticated
using (user_id = auth.uid());


-- Registra (o riassegna) il dispositivo corrente al socio collegato.
-- Se lo stesso browser era di un altro socio, passa a chi è collegato ora.
create or replace function public.push_registra(
  p_endpoint text,
  p_p256dh text,
  p_auth text,
  p_user_agent text default null
)
returns void
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
begin
  if public.current_user_role() is null then
    raise exception 'Profilo non approvato';
  end if;
  if coalesce(p_endpoint, '') !~ '^https://' or coalesce(p_p256dh, '') = '' or coalesce(p_auth, '') = '' then
    raise exception 'Iscrizione non valida';
  end if;

  insert into public.push_subscriptions (user_id, endpoint, p256dh, auth, user_agent)
  values (auth.uid(), p_endpoint, p_p256dh, p_auth, left(p_user_agent, 300))
  on conflict (endpoint) do update
     set user_id    = excluded.user_id,
         p256dh     = excluded.p256dh,
         auth       = excluded.auth,
         user_agent = excluded.user_agent;
end;
$$;

-- Rimuove il dispositivo corrente, solo se appartiene al socio collegato.
create or replace function public.push_rimuovi(p_endpoint text)
returns void
language sql
security definer
set search_path = public
set row_security = off
as $$
  delete from public.push_subscriptions
   where endpoint = p_endpoint
     and user_id = auth.uid();
$$;

revoke all on function public.push_registra(text, text, text, text) from public, anon;
revoke all on function public.push_rimuovi(text) from public, anon;
grant execute on function public.push_registra(text, text, text, text) to authenticated;
grant execute on function public.push_rimuovi(text) to authenticated;


-- ---------------------------------------------------------------------
-- Configurazione riservata al job
-- ---------------------------------------------------------------------
-- Chiavi usate dal job:
--   vapid_public, vapid_private, vapid_subject   notifiche push
--   avvisi_uscite_solo_a                          se presente, gli avvisi
--                                                 vanno solo a questo indirizzo
--                                                 (modalità di prova)
-- I valori NON stanno in questo file: si inseriscono a parte.

create table if not exists public.app_private_config (
  key        text primary key,
  value      text not null,
  updated_at timestamptz not null default now()
);

alter table public.app_private_config enable row level security;
revoke all on public.app_private_config from anon, authenticated;


-- =====================================================================
-- VERIFICA DOPO L'ESECUZIONE
-- =====================================================================
--
-- select tablename, policyname, cmd from pg_policies
--  where tablename in ('notifica_preferenze', 'push_subscriptions', 'app_private_config')
--  order by tablename, policyname;
--
-- select key from public.app_private_config;   -- solo i nomi, mai i valori
--
-- =====================================================================
