alter table public.profiles
  add column if not exists password_initialized boolean not null default false;

-- Imposta tutti i profili esistenti come già inizializzati per evitare blocchi agli utenti correnti
update public.profiles
set password_initialized = true
where password_initialized is distinct from true;
