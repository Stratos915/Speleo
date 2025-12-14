create table if not exists notifications (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users(id),
  target_role text,
  type text not null,
  title text not null,
  message text not null,
  link text,
  audience text default 'user', -- 'user' | 'admin'
  meta jsonb,
  due_date timestamptz,
  sent_email_at timestamptz,
  seen_at timestamptz,
  created_at timestamptz default now()
);

create index if not exists notifications_audience_idx on notifications(audience);
create index if not exists notifications_user_idx on notifications(user_id);
