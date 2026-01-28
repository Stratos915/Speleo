-- Campi aggiuntivi per richiesta approvazione
alter table public.profiles
  add column if not exists first_name text,
  add column if not exists last_name text,
  add column if not exists phone text,
  add column if not exists member_id uuid references public.members (id);

create index if not exists profiles_member_id_idx on public.profiles (member_id);
