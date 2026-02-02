-- RLS policies for loans to avoid recursive checks and allow members to manage their own loans
alter table public.loans enable row level security;

-- Ensure borrower_email exists for RLS checks (safe for existing data)
alter table public.loans
  add column if not exists borrower_email text;

create index if not exists loans_borrower_email_idx on public.loans (borrower_email);

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

-- Remove existing policies to avoid recursion / stack depth issues
 drop policy if exists loans_select on public.loans;
 drop policy if exists loans_insert on public.loans;
 drop policy if exists loans_update on public.loans;
 drop policy if exists loans_delete on public.loans;

-- Select: admins/magazziniere/presidente see all, others see only their own
create policy loans_select on public.loans
for select to authenticated
using (
  public.current_user_role() in ('admin', 'presidente', 'magazziniere')
  or borrower_email = coalesce(auth.jwt() ->> 'email', '')
  or borrower_name = coalesce(auth.jwt() ->> 'email', '')
);

-- Insert: admins/magazziniere/presidente can insert for anyone; socio only for themselves
create policy loans_insert on public.loans
for insert to authenticated
with check (
  public.current_user_role() in ('admin', 'presidente', 'magazziniere')
  or borrower_email = coalesce(auth.jwt() ->> 'email', '')
  or borrower_name = coalesce(auth.jwt() ->> 'email', '')
);

-- Update: admins/magazziniere/presidente can update; socio only their own loans
create policy loans_update on public.loans
for update to authenticated
using (
  public.current_user_role() in ('admin', 'presidente', 'magazziniere')
  or borrower_email = coalesce(auth.jwt() ->> 'email', '')
  or borrower_name = coalesce(auth.jwt() ->> 'email', '')
)
with check (
  public.current_user_role() in ('admin', 'presidente', 'magazziniere')
  or borrower_email = coalesce(auth.jwt() ->> 'email', '')
  or borrower_name = coalesce(auth.jwt() ->> 'email', '')
);

-- Delete: only admins/presidente/magazziniere
create policy loans_delete on public.loans
for delete to authenticated
using (
  public.current_user_role() in ('admin', 'presidente', 'magazziniere')
);
