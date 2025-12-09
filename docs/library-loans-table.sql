-- Tabella prestiti biblioteca
create table if not exists public.library_loans (
  id uuid primary key default gen_random_uuid(),
  book_id uuid not null references public.library_books (id) on delete cascade,
  borrower_name text not null,
  borrower_contact text,
  notes text,
  status text not null default 'active' check (status in ('active', 'returned')),
  loaned_at timestamptz not null default now(),
  returned_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists library_loans_book_idx on public.library_loans (book_id);
create index if not exists library_loans_status_idx on public.library_loans (status);

create trigger set_library_loans_updated_at
before update on public.library_loans
for each row execute procedure trigger_set_updated_at();
