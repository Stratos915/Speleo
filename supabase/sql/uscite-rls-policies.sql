-- RLS policies for uscite: allow soci to view/create/edit, restrict delete to admin/presidente.
alter table public.uscite enable row level security;

-- current_user_role() è definita una sola volta in
-- supabase/migrations/20260916090000_ruoli_e_profili.sql (non ridefinirla qui).

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
