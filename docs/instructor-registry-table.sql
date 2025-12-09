-- Tabella per il registro corpo istruttori
create table if not exists public.instructor_registry (
  id uuid primary key default gen_random_uuid(),
  year_id uuid,
  year_label text,
  member_id uuid not null,
  qualification_type text not null check (qualification_type in ('istruttore', 'aiuto_istruttore')),
  custom_qualification text,
  qualification_date date,
  last_maintenance_date date,
  next_maintenance_date date,
  activities text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.instructor_registry
  add constraint instructor_registry_member_fk
  foreign key (member_id) references public.profiles (id) on delete cascade;

create index if not exists instructor_registry_year_idx on public.instructor_registry (year_id);
create index if not exists instructor_registry_member_idx on public.instructor_registry (member_id);
create index if not exists instructor_registry_qualification_idx on public.instructor_registry (qualification_type);

create trigger set_instructor_registry_updated_at
before update on public.instructor_registry
for each row execute procedure trigger_set_updated_at();
