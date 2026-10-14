-- ============================================================================
-- 13 · Eliminazione degli account non più necessari
-- ----------------------------------------------------------------------------
-- Funzione elimina_account(p_user_id): cancella l'account di accesso (auth.users)
-- e, a cascata, profilo, preferenze avvisi e dispositivi iscritti alle notifiche.
--
-- * Possono usarla solo admin e presidente approvati.
-- * Non si può eliminare il proprio account.
-- * L'anagrafica soci (members), i prestiti e le uscite NON vengono toccati:
--   si elimina solo la possibilità di accedere all'app.
-- * L'operazione resta nello storico approvazioni (approval_audit, azione 'delete').
--
-- Script idempotente.
-- ============================================================================

create or replace function public.elimina_account(p_user_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_actor_email text;
  v_target record;
begin
  if v_actor is null then
    raise exception 'Accesso richiesto' using errcode = '42501';
  end if;

  select email into v_actor_email
    from public.profiles
   where id = v_actor
     and approval_status = 'approved'
     and role::text in ('admin', 'presidente');
  if not found then
    raise exception 'Solo amministratori e presidente possono eliminare gli account' using errcode = '42501';
  end if;

  if p_user_id = v_actor then
    raise exception 'Non puoi eliminare il tuo account' using errcode = '42501';
  end if;

  select id, email, role::text as role, approval_status
    into v_target
    from public.profiles
   where id = p_user_id;

  insert into public.approval_audit (
    actor_id, actor_email, target_id, target_email, action,
    from_status, to_status, from_role, to_role
  ) values (
    v_actor, v_actor_email, p_user_id,
    coalesce(v_target.email, (select email from auth.users where id = p_user_id)),
    'delete', v_target.approval_status, 'deleted', v_target.role, null
  );

  -- notifications.user_id non è in cascata: si tolgono prima.
  delete from public.notifications where user_id = p_user_id;
  delete from auth.users where id = p_user_id;
  if not found then
    -- Profilo senza utente di accesso (dato vecchio): si toglie il profilo.
    delete from public.profiles where id = p_user_id;
  end if;

  return coalesce(v_target.email, '');
end;
$$;

revoke all on function public.elimina_account(uuid) from public, anon;
grant execute on function public.elimina_account(uuid) to authenticated;
