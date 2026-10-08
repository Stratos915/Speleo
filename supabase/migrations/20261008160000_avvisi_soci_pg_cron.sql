-- =====================================================================
-- 11 · Avvisi ai soci ogni 10 minuti, direttamente da Supabase
-- ---------------------------------------------------------------------
-- GitHub Actions avvia il job notification-cron con molto ritardo
-- (in pratica 2-3 volte al giorno invece che ogni 30 minuti). Per gli
-- avvisi ai soci (nuove uscite, uscite modificate o annullate,
-- promemoria prestiti) la chiamata parte ora da pg_cron, ogni 10 minuti,
-- verso la Edge Function notification-cron con ?gruppo=soci.
--
-- Sicurezza: la funzione accetta la chiamata solo con il token
-- cron_soci_token, generato qui a caso e conservato in
-- app_private_config (non leggibile dal browser). Il token non compare
-- in questo file né in chiaro nel job: pg_cron lo legge al momento.
-- Il token abilita solo gli avvisi ai soci, non gli altri controlli.
--
-- GitHub Actions resta attivo per tutti i controlli: i due percorsi
-- possono sovrapporsi senza doppioni grazie all'indice (kind, ref_id).
--
-- Script idempotente. Richiede la migrazione 09.
-- =====================================================================

create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron;

-- Token casuale (256 bit circa), creato una volta sola
insert into public.app_private_config (key, value)
values ('cron_soci_token', replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''))
on conflict (key) do nothing;

-- Job ogni 10 minuti (rieseguendo lo script viene ricreato uguale)
select cron.unschedule(jobid) from cron.job where jobname = 'avvisi-soci';

select cron.schedule(
  'avvisi-soci',
  '*/10 * * * *',
  $job$
  select net.http_post(
    url := 'https://yqyijsjpzutwdgbtimvv.supabase.co/functions/v1/notification-cron?gruppo=soci',
    headers := jsonb_build_object(
      'content-type', 'application/json',
      'x-avvisi-token', (select value from public.app_private_config where key = 'cron_soci_token')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
  $job$
);


-- =====================================================================
-- VERIFICA DOPO L'ESECUZIONE
-- =====================================================================
--
-- select jobname, schedule, active from cron.job where jobname = 'avvisi-soci';
--
-- -- esiti delle ultime chiamate (dopo una decina di minuti)
-- select status_code, left(content, 300) as risposta, created
--   from net._http_response order by created desc limit 5;
--
-- -- per fermare il job:
-- -- select cron.unschedule('avvisi-soci');
--
-- =====================================================================
