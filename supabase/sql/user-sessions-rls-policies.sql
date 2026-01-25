-- RLS policies for user_sessions: admins/president see all, others see only their own session.
alter table public.user_sessions enable row level security;

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

drop policy if exists user_sessions_select on public.user_sessions;
drop policy if exists "allow session select for authenticated" on public.user_sessions;

create policy user_sessions_select on public.user_sessions
for select to authenticated
using (
  public.current_user_role() in ('admin', 'presidente')
  or user_id = auth.uid()
);
