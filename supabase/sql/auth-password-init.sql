-- Ensure profiles has password_initialized and default false
alter table public.profiles
  add column if not exists password_initialized boolean not null default false;

-- Create/replace profile on new auth user
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  insert into public.profiles (id, email, password_initialized)
  values (new.id, new.email, false)
  on conflict (id) do update
    set email = excluded.email;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row
execute procedure public.handle_new_user();

-- Allow app to mark the current user as initialized after password update
create or replace function public.mark_password_initialized()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.profiles
     set password_initialized = true,
         updated_at = now()
   where id = auth.uid();
end;
$$;

grant execute on function public.mark_password_initialized() to authenticated;

-- Reset flag for users without a password
update public.profiles p
   set password_initialized = false,
       updated_at = now()
 where p.id in (
   select id from auth.users where encrypted_password is null
 );
