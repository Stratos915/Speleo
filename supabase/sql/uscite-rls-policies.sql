-- RLS policies for uscite: allow soci to view/create/edit, restrict delete to admin/presidente.
alter table public.uscite enable row level security;

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

drop policy if exists uscite_select on public.uscite;
drop policy if exists uscite_insert on public.uscite;
drop policy if exists uscite_update on public.uscite;
drop policy if exists uscite_delete on public.uscite;

-- Select: all authenticated can read
create policy uscite_select on public.uscite
for select to authenticated
using (true);

-- Insert: allow roles that can edit uscite in the UI
create policy uscite_insert on public.uscite
for insert to authenticated
with check (
  public.current_user_role() in ('admin', 'presidente', 'magazziniere', 'socio')
);

-- Update: allow roles that can edit uscite in the UI
create policy uscite_update on public.uscite
for update to authenticated
using (
  public.current_user_role() in ('admin', 'presidente', 'magazziniere', 'socio')
)
with check (
  public.current_user_role() in ('admin', 'presidente', 'magazziniere', 'socio')
);

-- Delete: only admin/presidente
create policy uscite_delete on public.uscite
for delete to authenticated
using (
  public.current_user_role() in ('admin', 'presidente')
);
