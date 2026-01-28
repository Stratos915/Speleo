-- Storico approvazioni/rifiuti/cambi ruolo
create table if not exists public.approval_audit (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  actor_id uuid,
  actor_email text,
  target_id uuid,
  target_email text,
  action text not null,
  from_status text,
  to_status text,
  from_role text,
  to_role text
);

alter table public.approval_audit enable row level security;

-- Solo admin/presidente possono leggere e inserire
drop policy if exists approval_audit_select on public.approval_audit;
drop policy if exists approval_audit_insert on public.approval_audit;

create policy approval_audit_select on public.approval_audit
for select to authenticated
using (public.current_user_role() in ('admin', 'presidente'));

create policy approval_audit_insert on public.approval_audit
for insert to authenticated
with check (public.current_user_role() in ('admin', 'presidente'));
