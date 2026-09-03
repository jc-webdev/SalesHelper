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

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
    new.updated_at = now();
    return new;
end;
$$;

drop trigger if exists clubs_set_updated_at on public.clubs;
create trigger clubs_set_updated_at
before update on public.clubs
for each row execute function public.set_updated_at();

alter table public.clubs enable row level security;

drop policy if exists "Allow anon read clubs" on public.clubs;
create policy "Allow anon read clubs"
on public.clubs
for select
to anon, authenticated
using (true);

drop policy if exists "Allow anon insert clubs" on public.clubs;
create policy "Allow anon insert clubs"
on public.clubs
for insert
to anon, authenticated
with check (true);

drop policy if exists "Allow anon update clubs" on public.clubs;
create policy "Allow anon update clubs"
on public.clubs
for update
to anon, authenticated
using (true)
with check (true);
