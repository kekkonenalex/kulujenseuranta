-- ============================================================
--  Kulujenseuranta - Supabase / Postgres skeema
--  Aja tama kokonaisuudessaan Supabase SQL Editorissa (kertaalleen).
--  Skripti on idempotentti: sen voi ajaa uudelleen ilman virheita.
-- ============================================================

create extension if not exists "pgcrypto";

-- ------------------------------------------------------------
--  Kategoriat
-- ------------------------------------------------------------
create table if not exists public.categories (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  name        text not null,
  color       text not null default '#6366f1',
  sort_order  integer not null default 0,
  archived    boolean not null default false,
  created_at  timestamptz not null default now(),
  constraint categories_name_not_blank check (length(btrim(name)) > 0)
);

-- Sama kategorianimi ei voi esiintya kahdesti samalla kayttajalla
-- (kirjainkoko ja reunavalit normalisoitu).
create unique index if not exists categories_user_name_uniq
  on public.categories (user_id, lower(btrim(name)));

create index if not exists categories_user_sort_idx
  on public.categories (user_id, sort_order, created_at);

-- ------------------------------------------------------------
--  Transaktiot (kulut)
-- ------------------------------------------------------------
create table if not exists public.transactions (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users (id) on delete cascade,
  category_id   uuid not null references public.categories (id) on delete restrict,
  -- Summa SENTTEINA kokonaislukuna: liukuluvut eivat sovi rahalaskentaan.
  amount_cents  integer not null check (amount_cents > 0),
  occurred_on   date not null default current_date,
  description   text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists transactions_user_date_idx
  on public.transactions (user_id, occurred_on desc);

create index if not exists transactions_user_category_idx
  on public.transactions (user_id, category_id);

-- ------------------------------------------------------------
--  Budjetit
--
--  year_month NULL  = perusbudjetti, patee kaikkiin kuukausiin
--  year_month '2026-09' = vain sen kuukauden ylikirjoitus
--
--  Kokonaisbudjettia ei tallenneta: se on kategoriabudjettien summa.
-- ------------------------------------------------------------
create table if not exists public.budgets (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users (id) on delete cascade,
  category_id   uuid not null references public.categories (id) on delete cascade,
  year_month    text,
  amount_cents  integer not null check (amount_cents >= 0),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint budgets_year_month_format check (
    year_month is null or year_month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'
  )
);

-- Yksi perusbudjetti per kategoria ...
create unique index if not exists budgets_default_uniq
  on public.budgets (category_id)
  where year_month is null;

-- ... ja yksi ylikirjoitus per kategoria ja kuukausi.
create unique index if not exists budgets_month_uniq
  on public.budgets (category_id, year_month)
  where year_month is not null;

create index if not exists budgets_user_idx
  on public.budgets (user_id, year_month);

-- ------------------------------------------------------------
--  updated_at paivittyy automaattisesti
-- ------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $fn$
begin
  new.updated_at := now();
  return new;
end;
$fn$;

drop trigger if exists transactions_set_updated_at on public.transactions;
create trigger transactions_set_updated_at
  before update on public.transactions
  for each row execute function public.set_updated_at();

drop trigger if exists budgets_set_updated_at on public.budgets;
create trigger budgets_set_updated_at
  before update on public.budgets
  for each row execute function public.set_updated_at();

-- ------------------------------------------------------------
--  Eheystarkistus: transaktion kategoria kuuluu samalle kayttajalle
-- ------------------------------------------------------------
create or replace function public.check_category_owner()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
declare
  owner uuid;
begin
  select user_id into owner from public.categories where id = new.category_id;
  if owner is null or owner <> new.user_id then
    raise exception 'Kategoria ei kuulu tälle käyttäjälle';
  end if;
  return new;
end;
$fn$;

drop trigger if exists transactions_check_category_owner on public.transactions;
create trigger transactions_check_category_owner
  before insert or update of category_id, user_id on public.transactions
  for each row execute function public.check_category_owner();

drop trigger if exists budgets_check_category_owner on public.budgets;
create trigger budgets_check_category_owner
  before insert or update of category_id, user_id on public.budgets
  for each row execute function public.check_category_owner();

-- ------------------------------------------------------------
--  Row Level Security: kayttaja nakee ja muokkaa vain omaa dataansa.
--  Tama on sovelluksen varsinainen suojaus - selaimessa oleva
--  anon-avain on julkinen eika ole salaisuus.
-- ------------------------------------------------------------
alter table public.categories   enable row level security;
alter table public.transactions enable row level security;
alter table public.budgets      enable row level security;

drop policy if exists categories_select on public.categories;
drop policy if exists categories_insert on public.categories;
drop policy if exists categories_update on public.categories;
drop policy if exists categories_delete on public.categories;

create policy categories_select on public.categories
  for select using (auth.uid() = user_id);
create policy categories_insert on public.categories
  for insert with check (auth.uid() = user_id);
create policy categories_update on public.categories
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy categories_delete on public.categories
  for delete using (auth.uid() = user_id);

drop policy if exists transactions_select on public.transactions;
drop policy if exists transactions_insert on public.transactions;
drop policy if exists transactions_update on public.transactions;
drop policy if exists transactions_delete on public.transactions;

create policy transactions_select on public.transactions
  for select using (auth.uid() = user_id);
create policy transactions_insert on public.transactions
  for insert with check (auth.uid() = user_id);
create policy transactions_update on public.transactions
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy transactions_delete on public.transactions
  for delete using (auth.uid() = user_id);

drop policy if exists budgets_select on public.budgets;
drop policy if exists budgets_insert on public.budgets;
drop policy if exists budgets_update on public.budgets;
drop policy if exists budgets_delete on public.budgets;

create policy budgets_select on public.budgets
  for select using (auth.uid() = user_id);
create policy budgets_insert on public.budgets
  for insert with check (auth.uid() = user_id);
create policy budgets_update on public.budgets
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy budgets_delete on public.budgets
  for delete using (auth.uid() = user_id);

-- ------------------------------------------------------------
--  VALMIS. Ei valmiita kategorioita - luot ne itse sovelluksessa.
-- ------------------------------------------------------------
