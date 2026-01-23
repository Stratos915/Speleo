-- RLS policies for activity_logs: admins/president see all, others see only their own entries.
alter table public.activity_logs enable row level security;

-- Helper: resolve role from profiles (security definer)
create or replace function public.current_user_role()
returns text
language sql
security definer
set search_path = public
set row_security = off
as $$
  select role from public.profiles where id = auth.uid();
$$;

grant execute on function public.current_user_role() to authenticated;

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
