-- =====================================================================
-- 06 · Uscite: orario di rientro previsto
-- ---------------------------------------------------------------------
-- Se un'uscita resta aperta oltre il rientro previsto (più una
-- tolleranza), il job delle notifiche avvisa il responsabile e il
-- presidente. È un PROMEMORIA: non sostituisce le procedure di
-- sicurezza del gruppo né la chiamata al Soccorso (112 / CNSAS).
-- =====================================================================

alter table public.uscite
  add column if not exists rientro_previsto timestamptz,
  add column if not exists status text default 'aperta',
  add column if not exists closed_at timestamptz;

create index if not exists uscite_rientro_aperte_idx
  on public.uscite (rientro_previsto)
  where status is distinct from 'chiusa';
