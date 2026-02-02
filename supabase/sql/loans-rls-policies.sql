-- RLS policies for loans to avoid recursive checks and allow members to manage their own loans
alter table public.loans enable row level security;

-- Ensure borrower_email exists for RLS checks (safe for existing data)
alter table public.loans
  add column if not exists borrower_email text;

create index if not exists loans_borrower_email_idx on public.loans (borrower_email);

-- Track missing items on return
alter table public.loans
  add column if not exists missing_quantity integer default 0;

alter table public.loans
  add column if not exists missing_notes text;

alter table public.loans
  drop constraint if exists loans_missing_quantity_check;

alter table public.loans
  add constraint loans_missing_quantity_check
  check (missing_quantity >= 0 and missing_quantity <= quantity);

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

-- Keep equipment availability in sync with loans
create or replace function public.adjust_equipment_on_loan_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status in ('in_corso', 'active') then
    update public.equipment
      set quantity_available = greatest(coalesce(quantity_available, quantity_total) - new.quantity, 0)
      where equipment_id = new.equipment_id;
  end if;
  return new;
end;
$$;

create or replace function public.adjust_equipment_on_loan_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.status in ('in_corso', 'active') and new.status = 'chiuso' then
    update public.equipment
      set quantity_available = coalesce(quantity_available, quantity_total) + (old.quantity - coalesce(new.missing_quantity, 0))
      where equipment_id = old.equipment_id;
  end if;
  return new;
end;
$$;

create or replace function public.adjust_equipment_on_loan_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.status in ('in_corso', 'active') then
    update public.equipment
      set quantity_available = coalesce(quantity_available, quantity_total) + old.quantity
      where equipment_id = old.equipment_id;
  end if;
  return old;
end;
$$;

drop trigger if exists loans_adjust_equipment_insert on public.loans;
drop trigger if exists loans_adjust_equipment_update on public.loans;
drop trigger if exists loans_adjust_equipment_delete on public.loans;

create trigger loans_adjust_equipment_insert
after insert on public.loans
for each row execute function public.adjust_equipment_on_loan_insert();

create trigger loans_adjust_equipment_update
after update of status on public.loans
for each row execute function public.adjust_equipment_on_loan_update();

create trigger loans_adjust_equipment_delete
after delete on public.loans
for each row execute function public.adjust_equipment_on_loan_delete();

-- Ensure triggers are enabled (Supabase UI may disable them during testing)
alter table public.loans enable trigger loans_adjust_equipment_insert;
alter table public.loans enable trigger loans_adjust_equipment_update;
alter table public.loans enable trigger loans_adjust_equipment_delete;
