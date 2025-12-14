create table if not exists public.activity_logs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  user_id uuid,
  user_email text,
  user_role text,
  action text not null,
  entity text,
  entity_id text,
  message text,
  details jsonb
);

-- Aggiungi eventuale policy RLS come preferisci. Suggerimento:
-- enable row level security e consenti a tutti gli utenti autenticati di inserire/leggere i log.
