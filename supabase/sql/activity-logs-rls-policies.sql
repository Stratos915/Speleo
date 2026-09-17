-- RLS policies for activity_logs: admins/president see all, others see only their own entries.
alter table public.activity_logs enable row level security;

-- current_user_role() è definita una sola volta in
-- supabase/migrations/20260916090000_ruoli_e_profili.sql (non ridefinirla qui).

drop policy if exists activity_logs_select on public.activity_logs;
drop policy if exists activity_logs_insert on public.activity_logs;

create policy activity_logs_select on public.activity_logs
for select to authenticated
using (
  public.current_user_role() in ('admin', 'presidente')
  or user_id = auth.uid()
);

create policy activity_logs_insert on public.activity_logs
for insert to authenticated
with check (
  user_id = auth.uid() or user_id is null
);
