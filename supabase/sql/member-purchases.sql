-- Tabelle e policy RLS per acquisti soci (magliette, gadget, ecc.)
create table if not exists public.member_purchases (
  id uuid primary key default gen_random_uuid(),
  member_id text not null,
  item_type text not null,
  size text,
  quantity integer not null default 1,
  price numeric(10, 2),
  payment_status text not null default 'unpaid',
  status text not null default 'ordered',
  purchase_date date,
  payment_date date,
  delivery_date date,
  purchase_year integer not null default extract(year from now()),
  notes text,
  created_at timestamptz not null default now()
);

create index if not exists member_purchases_member_id_idx on public.member_purchases (member_id);
create index if not exists member_purchases_created_at_idx on public.member_purchases (created_at desc);

alter table public.member_purchases enable row level security;

-- current_user_role() è definita una sola volta in
-- supabase/migrations/20260916090000_ruoli_e_profili.sql (non ridefinirla qui).

drop policy if exists member_purchases_select on public.member_purchases;
drop policy if exists member_purchases_insert on public.member_purchases;
drop policy if exists member_purchases_update on public.member_purchases;
drop policy if exists member_purchases_delete on public.member_purchases;

create policy member_purchases_select on public.member_purchases
for select to authenticated
using (
  public.current_user_role() in (
    'admin',
    'presidente',
    'consiglio',
    'segretario',
    'tesoriere',
    'magazziniere',
    'direttore_scuola'
  )
);

create policy member_purchases_insert on public.member_purchases
for insert to authenticated
with check (
  public.current_user_role() in ('admin', 'presidente', 'segretario', 'tesoriere')
);

create policy member_purchases_update on public.member_purchases
for update to authenticated
using (
  public.current_user_role() in ('admin', 'presidente', 'segretario', 'tesoriere')
)
with check (
  public.current_user_role() in ('admin', 'presidente', 'segretario', 'tesoriere')
);

create policy member_purchases_delete on public.member_purchases
for delete to authenticated
using (
  public.current_user_role() in ('admin', 'presidente', 'segretario', 'tesoriere')
);
