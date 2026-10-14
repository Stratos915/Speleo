-- =====================================================================
-- 15 · Adesioni alle uscite («Partecipo · Forse · No») e nuove tipologie
-- ---------------------------------------------------------------------
-- * uscite.tipo_descrizione: testo libero per la tipologia «Altro evento».
--   Le tipologie stanno in uscite.tipo (testo): «serata_sede» e
--   «altro_evento» non richiedono altro.
-- * uscite_adesioni: una risposta per socio e uscita. La leggono tutti i
--   profili approvati; si scrive solo con le funzioni qui sotto.
-- * uscita_rispondi: risposta dall'app (socio collegato).
-- * uscita_rispondi_token: risposta da un link personale (email o pulsante
--   della notifica), senza accesso. Il link contiene uscita, socio e una
--   firma HMAC con il segreto «adesioni_segreto» di app_private_config;
--   lo stesso segreto lo usa il job notification-cron per creare i link.
-- * uscita_adesioni: elenco delle risposte con i nomi, per la scheda.
--
-- La tabella uscite e i suoi permessi non cambiano: si aggiunge solo
-- una colonna facoltativa.
-- Richiede le migrazioni 01 (current_user_role) e 09 (app_private_config).
-- Script idempotente.
-- =====================================================================

alter table public.uscite add column if not exists tipo_descrizione text;


-- ---------------------------------------------------------------------
-- Risposte
-- ---------------------------------------------------------------------

create table if not exists public.uscite_adesioni (
  uscita_id           uuid not null references public.uscite (id) on delete cascade,
  user_id             uuid not null references public.profiles (id) on delete cascade,
  risposta            text not null check (risposta in ('si', 'forse', 'no')),
  risposta_precedente text check (risposta_precedente in ('si', 'forse', 'no')),
  origine             text not null default 'app' check (origine in ('app', 'link')),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  primary key (uscita_id, user_id)
);

create index if not exists uscite_adesioni_updated_idx on public.uscite_adesioni (updated_at);
create index if not exists uscite_adesioni_user_idx on public.uscite_adesioni (user_id);

alter table public.uscite_adesioni enable row level security;
revoke all on public.uscite_adesioni from anon;
revoke insert, update, delete on public.uscite_adesioni from authenticated;
grant select on public.uscite_adesioni to authenticated;

drop policy if exists uscite_adesioni_select on public.uscite_adesioni;

-- Le adesioni le vedono tutti i soci approvati.
create policy uscite_adesioni_select on public.uscite_adesioni
for select to authenticated
using (public.current_user_role() is not null);


-- Segreto per firmare i link personali (generato una volta sola).
insert into public.app_private_config (key, value)
values ('adesioni_segreto', encode(extensions.gen_random_bytes(32), 'hex'))
on conflict (key) do nothing;


-- ---------------------------------------------------------------------
-- Registrazione della risposta (interna)
-- ---------------------------------------------------------------------

create or replace function public._uscita_registra_adesione(
  p_uscita uuid,
  p_user uuid,
  p_risposta text,
  p_origine text
)
returns jsonb
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_uscita   public.uscite%rowtype;
  v_attuale  text;
  v_risposta text := lower(trim(coalesce(p_risposta, '')));
begin
  select * into v_uscita from public.uscite where id = p_uscita;
  if not found then
    raise exception 'Uscita non trovata' using errcode = 'P0002';
  end if;

  if not exists (select 1 from public.profiles where id = p_user and approval_status = 'approved') then
    raise exception 'Account non approvato' using errcode = '42501';
  end if;

  select risposta into v_attuale
    from public.uscite_adesioni
   where uscita_id = p_uscita and user_id = p_user;

  -- Senza risposta: si restituisce solo lo stato attuale (pagina del link).
  if v_risposta <> '' then
    if v_risposta not in ('si', 'forse', 'no') then
      raise exception 'Risposta non valida' using errcode = '22023';
    end if;
    if coalesce(v_uscita.status, 'aperta') = 'chiusa' then
      raise exception 'L''uscita è chiusa: non si può più rispondere' using errcode = '22023';
    end if;
    if v_attuale is null then
      insert into public.uscite_adesioni (uscita_id, user_id, risposta, origine)
      values (p_uscita, p_user, v_risposta, p_origine);
    elsif v_attuale <> v_risposta then
      update public.uscite_adesioni
         set risposta_precedente = v_attuale,
             risposta = v_risposta,
             origine = p_origine,
             updated_at = now()
       where uscita_id = p_uscita and user_id = p_user;
    end if;
    v_attuale := v_risposta;
  end if;

  return jsonb_build_object(
    'uscita_id', v_uscita.id,
    'titolo', v_uscita.titolo,
    'data', v_uscita.data,
    'ora', v_uscita.ora,
    'luogo', v_uscita.luogo,
    'chiusa', coalesce(v_uscita.status, 'aperta') = 'chiusa',
    'risposta', v_attuale
  );
end;
$$;

revoke all on function public._uscita_registra_adesione(uuid, uuid, text, text) from public, anon, authenticated;


-- ---------------------------------------------------------------------
-- Risposta dall'app
-- ---------------------------------------------------------------------

create or replace function public.uscita_rispondi(p_uscita uuid, p_risposta text)
returns jsonb
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
begin
  if auth.uid() is null or public.current_user_role() is null then
    raise exception 'Accesso non consentito' using errcode = '42501';
  end if;
  return public._uscita_registra_adesione(p_uscita, auth.uid(), p_risposta, 'app');
end;
$$;

revoke all on function public.uscita_rispondi(uuid, text) from public, anon;
grant execute on function public.uscita_rispondi(uuid, text) to authenticated;


-- ---------------------------------------------------------------------
-- Risposta da link personale (email o pulsante della notifica)
-- Token: <uscita>.<socio>.<hmac-sha256 esadecimale di "<uscita>.<socio>">
-- ---------------------------------------------------------------------

create or replace function public.uscita_rispondi_token(p_token text, p_risposta text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_parti   text[] := string_to_array(coalesce(p_token, ''), '.');
  v_segreto text;
  v_firma   text;
  v_uscita  uuid;
  v_user    uuid;
begin
  if array_length(v_parti, 1) is distinct from 3 then
    raise exception 'Link non valido' using errcode = '22023';
  end if;

  select value into v_segreto from public.app_private_config where key = 'adesioni_segreto';
  if v_segreto is null then
    raise exception 'Adesioni non configurate' using errcode = '55000';
  end if;

  v_firma := encode(extensions.hmac(v_parti[1] || '.' || v_parti[2], v_segreto, 'sha256'), 'hex');
  if v_firma <> lower(v_parti[3]) then
    raise exception 'Link non valido' using errcode = '22023';
  end if;

  begin
    v_uscita := v_parti[1]::uuid;
    v_user := v_parti[2]::uuid;
  exception when others then
    raise exception 'Link non valido' using errcode = '22023';
  end;

  return public._uscita_registra_adesione(v_uscita, v_user, p_risposta, 'link');
end;
$$;

revoke all on function public.uscita_rispondi_token(text, text) from public;
grant execute on function public.uscita_rispondi_token(text, text) to anon, authenticated;


-- ---------------------------------------------------------------------
-- Elenco delle risposte con i nomi (per la scheda dell'uscita)
-- ---------------------------------------------------------------------

create or replace function public.uscita_adesioni(p_uscita uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
set row_security = off
as $$
declare
  v_risposte jsonb;
  v_senza    integer;
begin
  if public.current_user_role() is null then
    raise exception 'Accesso non consentito' using errcode = '42501';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'user_id', a.user_id,
           'member_id', coalesce(p.member_id, m.id),
           'nome', coalesce(
             nullif(trim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')), ''),
             m.full_name,
             split_part(p.email, '@', 1)
           ),
           'risposta', a.risposta,
           'updated_at', a.updated_at
         ) order by a.updated_at), '[]'::jsonb)
    into v_risposte
    from public.uscite_adesioni a
    join public.profiles p on p.id = a.user_id
    left join lateral (
      select mm.id, mm.full_name
        from public.members mm
       where (p.member_id is not null and mm.id = p.member_id)
          or (p.member_id is null and p.email is not null and lower(mm.email) = lower(p.email))
       order by mm.membership_year desc nulls last
       limit 1
    ) m on true
   where a.uscita_id = p_uscita;

  select count(*) into v_senza
    from public.profiles p
   where p.approval_status = 'approved'
     and not exists (
       select 1 from public.uscite_adesioni a where a.uscita_id = p_uscita and a.user_id = p.id
     );

  return jsonb_build_object('risposte', v_risposte, 'senza_risposta', v_senza);
end;
$$;

revoke all on function public.uscita_adesioni(uuid) from public, anon;
grant execute on function public.uscita_adesioni(uuid) to authenticated;


-- =====================================================================
-- VERIFICA DOPO L'ESECUZIONE
-- =====================================================================
--
-- select column_name from information_schema.columns
--  where table_name = 'uscite' and column_name = 'tipo_descrizione';
-- select proname from pg_proc
--  where proname in ('uscita_rispondi', 'uscita_rispondi_token', 'uscita_adesioni');
-- select key from public.app_private_config where key = 'adesioni_segreto';
