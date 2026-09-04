create extension if not exists pgcrypto;

create table if not exists public.clubs (
    id text primary key,
    club_name text not null,
    email_1 text,
    email_2 text,
    call_status text not null default 'Nie wykonano połączenia',
    call_note text not null default '',
    payload jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table if not exists public.profiles (
    id uuid primary key references auth.users(id) on delete cascade,
    email text not null unique,
    full_name text not null,
    is_admin boolean not null default false,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table if not exists public.shared_memos (
    id uuid primary key default gen_random_uuid(),
    author_id uuid not null references auth.users(id) on delete cascade,
    author_email text not null,
    author_name text not null,
    note text not null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
    new.updated_at = now();
    return new;
end;
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    insert into public.profiles (id, email, full_name, is_admin)
    values (
        new.id,
        new.email,
        coalesce(new.raw_user_meta_data ->> 'full_name', new.email),
        false
    )
    on conflict (id) do update
    set
        email = excluded.email,
        full_name = excluded.full_name;

    return new;
end;
$$;

create or replace function public.is_admin_user(user_id uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
    select exists (
        select 1
        from public.profiles
        where id = user_id and is_admin = true
    );
$$;

drop trigger if exists clubs_set_updated_at on public.clubs;
create trigger clubs_set_updated_at
before update on public.clubs
for each row execute function public.set_updated_at();

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

drop trigger if exists shared_memos_set_updated_at on public.shared_memos;
create trigger shared_memos_set_updated_at
before update on public.shared_memos
for each row execute function public.set_updated_at();

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

alter table public.clubs enable row level security;
alter table public.profiles enable row level security;
alter table public.shared_memos enable row level security;

drop policy if exists "Allow authenticated read clubs" on public.clubs;
create policy "Allow authenticated read clubs"
on public.clubs
for select
to authenticated
using (auth.uid() is not null);

drop policy if exists "Allow authenticated insert clubs" on public.clubs;
create policy "Allow authenticated insert clubs"
on public.clubs
for insert
to authenticated
with check (auth.uid() is not null);

drop policy if exists "Allow authenticated update clubs" on public.clubs;
create policy "Allow authenticated update clubs"
on public.clubs
for update
to authenticated
using (auth.uid() is not null)
with check (auth.uid() is not null);

drop policy if exists "Allow authenticated read profiles" on public.profiles;
create policy "Allow authenticated read profiles"
on public.profiles
for select
to authenticated
using (id = auth.uid());

drop policy if exists "Allow authenticated update profiles" on public.profiles;
create policy "Allow authenticated update profiles"
on public.profiles
for update
to authenticated
using (id = auth.uid() or public.is_admin_user(auth.uid()))
with check (id = auth.uid() or public.is_admin_user(auth.uid()));

drop policy if exists "Allow admin update any profile" on public.profiles;
create policy "Allow admin update any profile"
on public.profiles
for update
to authenticated
using (public.is_admin_user(auth.uid()))
with check (public.is_admin_user(auth.uid()));

drop policy if exists "Allow authenticated read shared memos" on public.shared_memos;
create policy "Allow authenticated read shared memos"
on public.shared_memos
for select
to authenticated
using (auth.uid() is not null);

drop policy if exists "Allow authenticated insert shared memos" on public.shared_memos;
create policy "Allow authenticated insert shared memos"
on public.shared_memos
for insert
to authenticated
with check (auth.uid() is not null);

drop policy if exists "Allow authenticated delete shared memos" on public.shared_memos;
create policy "Allow authenticated delete shared memos"
on public.shared_memos
for delete
to authenticated
using (author_id = auth.uid() or public.is_admin_user(auth.uid()));
