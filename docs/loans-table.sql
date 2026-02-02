-- Tabella prestiti per Speleo App.
create table if not exists public.loans (
  id uuid primary key default gen_random_uuid(),
  equipment_id bigint references public.equipment(equipment_id) on delete restrict,
  uscita_id text,
  reserved_until date,
  borrower_name text not null,
  borrower_email text,
  borrower_member_number integer,
  quantity integer not null check (quantity > 0),
  missing_quantity integer default 0 check (missing_quantity >= 0 and missing_quantity <= quantity),
  missing_notes text,
  status text not null default 'in_corso',
  delivered_at timestamptz not null default now(),
  returned_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.set_loans_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger handle_loans_updated_at
before update on public.loans
for each row execute function public.set_loans_updated_at();

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

alter table public.loans enable trigger loans_adjust_equipment_insert;
alter table public.loans enable trigger loans_adjust_equipment_update;
alter table public.loans enable trigger loans_adjust_equipment_delete;
