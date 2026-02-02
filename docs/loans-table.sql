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
