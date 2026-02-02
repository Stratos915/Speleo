-- Campi aggiuntivi per richiesta approvazione
alter table public.profiles
  add column if not exists first_name text,
  add column if not exists last_name text,
  add column if not exists phone text,
  add column if not exists member_id uuid references public.members (id);

-- Allow deleting a member while keeping the profile (disassociate on delete)
alter table public.profiles
  drop constraint if exists profiles_member_id_fkey;

alter table public.profiles
  add constraint profiles_member_id_fkey
  foreign key (member_id)
  references public.members (id)
  on delete set null;

create index if not exists profiles_member_id_idx on public.profiles (member_id);
