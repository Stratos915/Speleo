create table if not exists public.notification_log (
  id uuid primary key default gen_random_uuid(),
  loan_id uuid,
  kind text not null,
  target_role text,
  target_email text,
  status text default 'PENDING',
  message text,
  meta jsonb,
  created_at timestamptz default now()
);

create unique index if not exists notification_log_unique_idx
  on public.notification_log (loan_id, kind, target_role, target_email);
