-- Tabella biblioteca per Supabase
create table if not exists public.library_books (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  title text not null,
  author text,
  topic text,
  shelf_position text,
  notes text,
  status text not null default 'available' check (status in ('available', 'loaned', 'maintenance')),
  borrower_name text,
  borrower_contact text,
  loan_notes text,
  loaned_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists library_books_status_idx on public.library_books (status);
create index if not exists library_books_code_idx on public.library_books (code);

-- Aggiorna automaticamente il campo updated_at a ogni modifica (assicurarsi che la funzione esista in Supabase).
create trigger set_library_books_updated_at
before update on public.library_books
for each row execute procedure trigger_set_updated_at();
