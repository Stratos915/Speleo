-- ============================================================================
-- 14 · Registrazione dall'app e doppio ruolo
-- ----------------------------------------------------------------------------
-- 1. Registrazione: chi si iscrive dal pulsante «Registrati» lascia nome, cognome
--    e telefono nei metadati; il profilo li riceve subito e non chiede di nuovo
--    la password al primo accesso. Il profilo resta «pending» finché un
--    amministratore non lo approva (come prima).
-- 2. Doppio ruolo: profiles.ruoli_extra raccoglie ruoli in più rispetto a quello
--    principale (per esempio segretario + socio). has_any_role() considera tutti
--    i ruoli, e le policy che confrontavano solo il ruolo principale passano a
--    has_any_role(). admin e presidente non si danno come ruolo in più: restano
--    solo ruolo principale.
-- 3. Solo admin e presidente possono cambiare i ruoli in più (come il ruolo).
--
-- Script idempotente.
-- ============================================================================

-- 1 · Registrazione ----------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  v_self boolean := coalesce((v_meta ->> 'self_signup')::boolean, false);
begin
  insert into public.profiles (id, email, password_initialized, first_name, last_name, phone)
  values (
    new.id,
    new.email,
    v_self,
    case when v_self then nullif(trim(v_meta ->> 'first_name'), '') end,
    case when v_self then nullif(trim(v_meta ->> 'last_name'), '') end,
    case when v_self then nullif(trim(v_meta ->> 'phone'), '') end
  )
  on conflict (id) do update
    set email = excluded.email;
  return new;
end;
$$;

-- 2 · Ruoli in più -----------------------------------------------------------
alter table public.profiles
  add column if not exists ruoli_extra text[] not null default '{}';

alter table public.profiles drop constraint if exists profiles_ruoli_extra_validi;
alter table public.profiles
  add constraint profiles_ruoli_extra_validi
  check (ruoli_extra <@ array['consiglio', 'segretario', 'tesoriere', 'magazziniere', 'direttore_scuola', 'socio']::text[]);

create or replace function public.current_user_roles()
returns text[]
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select array[role::text] || coalesce(ruoli_extra, '{}'::text[])
    from public.profiles
   where id = auth.uid()
     and approval_status = 'approved';
$$;

revoke all on function public.current_user_roles() from public, anon;
grant execute on function public.current_user_roles() to authenticated;

create or replace function public.has_any_role(roles text[])
returns boolean
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select coalesce(public.current_user_roles() && roles, false);
$$;

-- Le policy che controllavano solo il ruolo principale considerano ora tutti i ruoli.
do $$
declare
  p record;
  v_using text;
  v_check text;
  v_sql text;
begin
  for p in
    select schemaname, tablename, policyname, qual, with_check
      from pg_policies
     where schemaname = 'public'
       and (coalesce(qual, '') like '%current_user_role() = ANY (%'
            or coalesce(with_check, '') like '%current_user_role() = ANY (%')
  loop
    v_using := replace(p.qual, 'current_user_role() = ANY (', 'has_any_role(');
    v_check := replace(p.with_check, 'current_user_role() = ANY (', 'has_any_role(');
    v_sql := format('alter policy %I on %I.%I', p.policyname, p.schemaname, p.tablename);
    if v_using is not null then
      v_sql := v_sql || format(' using (%s)', v_using);
    end if;
    if v_check is not null then
      v_sql := v_sql || format(' with check (%s)', v_check);
    end if;
    execute v_sql;
  end loop;
end;
$$;

-- 3 · Protezione: i ruoli in più li cambiano solo admin e presidente -----------
create or replace function public.profiles_guard_privileged_columns()
returns trigger
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
begin
  if auth.uid() is null then
    return new;
  end if;

  if public.has_any_role(array['admin', 'presidente']) then
    return new;
  end if;

  if tg_op = 'INSERT' then
    new.role := 'socio';
    new.ruoli_extra := '{}';
    new.approval_status := 'pending';
    new.approved_at := null;
    return new;
  end if;

  if new.id is distinct from old.id then
    raise exception 'Operazione non consentita sul profilo.'
      using errcode = '42501';
  end if;

  if new.role is distinct from old.role
     or new.ruoli_extra is distinct from old.ruoli_extra then
    raise exception 'Solo admin o presidente possono modificare il ruolo.'
      using errcode = '42501';
  end if;

  if new.approval_status is distinct from old.approval_status
     and coalesce(new.approval_status, '') <> 'pending' then
    raise exception 'Solo admin o presidente possono approvare un profilo.'
      using errcode = '42501';
  end if;

  if new.approved_at is distinct from old.approved_at then
    raise exception 'Solo admin o presidente possono approvare un profilo.'
      using errcode = '42501';
  end if;

  return new;
end;
$$;
