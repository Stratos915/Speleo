-- Aggiorna la tabella soci per supportare cartelle annuali distincte.
alter table if exists public.members
  add column if not exists membership_year integer not null default 2025;

-- Permetti lo stesso numero tessera in anni diversi.
alter table if exists public.members
  drop constraint if exists members_old_id_key;

alter table if exists public.members
  drop constraint if exists members_membership_number_key;

alter table if exists public.members
  add constraint members_old_id_year_key unique (old_id, membership_year);

alter table if exists public.members
  add constraint members_membership_number_year_key unique (membership_number, membership_year);
