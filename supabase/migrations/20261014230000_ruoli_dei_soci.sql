-- =====================================================================
-- 16 · Ruoli dei soci (per esportazioni e avvisi)
-- ---------------------------------------------------------------------
-- L'anagrafica ha una riga per socio e per anno (members), e spesso solo
-- una di queste righe ha l'email. Un'uscita può quindi puntare a una riga
-- «senza email» e il profilo dell'app della persona non si trova.
--
-- profili_dei_soci(p_member_ids, p_user_ids) restituisce, per ogni riga
-- di anagrafica richiesta, il profilo approvato della stessa persona
-- (stessa tessera e stesso nome, collegato per member_id o per email)
-- con i suoi ruoli nell'app; per ogni profilo richiesto, i suoi ruoli.
-- Serve al PDF dell'uscita (colonna «Ruolo») e al job delle notifiche
-- (avviso al responsabile, rientro superato).
--
-- Nessuna tabella cambia. Solo lettura. Script idempotente.
-- Richiede le migrazioni 01 (current_user_role) e 14 (ruoli_extra).
-- =====================================================================

create or replace function public.profili_dei_soci(
  p_member_ids uuid[] default '{}',
  p_user_ids uuid[] default '{}'
)
returns table (member_id uuid, user_id uuid, ruoli text[])
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  with autorizzato as (
    -- soci approvati dall'app, oppure il job (chiave di servizio)
    select (public.current_user_role() is not null
            or coalesce(auth.role(), '') = 'service_role') as ok
  ),
  richiesti as (
    select m.id, m.old_id, lower(trim(coalesce(m.full_name, ''))) as nome
      from public.members m
     where m.id = any(coalesce(p_member_ids, '{}'))
  ),
  stessa_persona as (
    select r.id as richiesto,
           m2.id as socio,
           lower(nullif(trim(m2.email), '')) as email,
           (m2.id = r.id) as stessa_riga
      from richiesti r
      join public.members m2
        on m2.id = r.id
        or (r.old_id is not null
            and m2.old_id = r.old_id
            and r.nome <> ''
            and lower(trim(coalesce(m2.full_name, ''))) = r.nome)
  ),
  per_socio as (
    select distinct on (s.richiesto)
           s.richiesto as member_id,
           p.id as user_id,
           array[p.role::text] || coalesce(p.ruoli_extra, '{}'::text[]) as ruoli
      from stessa_persona s
      join public.profiles p
        on p.approval_status = 'approved'
       and (p.member_id = s.socio
            or (s.email is not null and lower(p.email) = s.email))
     order by s.richiesto, s.stessa_riga desc, (p.member_id = s.socio) desc
  ),
  per_profilo as (
    select null::uuid as member_id,
           p.id as user_id,
           array[p.role::text] || coalesce(p.ruoli_extra, '{}'::text[]) as ruoli
      from public.profiles p
     where p.id = any(coalesce(p_user_ids, '{}'))
       and p.approval_status = 'approved'
  )
  select x.member_id, x.user_id, x.ruoli
    from (select * from per_socio union all select * from per_profilo) x,
         autorizzato a
   where a.ok;
$$;

revoke all on function public.profili_dei_soci(uuid[], uuid[]) from public, anon;
grant execute on function public.profili_dei_soci(uuid[], uuid[]) to authenticated, service_role;
