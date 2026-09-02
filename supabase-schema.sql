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

-- ============================================================
--  LAITETUNNISTEET JA PIKAKOMENTO-RAJAPINTA (iPhone Shortcuts)
--
--  Pikakomento ei voi kirjautua kuten sovellus: kayttooikeustunnus
--  vanhenee tunnissa ja paivitystunnus kiertaa. Siksi puhelimelle
--  annetaan oma pitkaikainen laitetunniste.
--
--  Tietokantaan tallennetaan vain tunnisteen SHA-256-tiiviste, ei
--  tunnistetta itseaan. Tunnisteella voi VAIN kirjata kulun ja
--  hakea kategorialistan - ei lukea kuluja eika poistaa mitaan.
-- ============================================================

create table if not exists public.device_tokens (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users (id) on delete cascade,
  name          text not null default 'iPhone',
  token_hash    text not null unique,
  created_at    timestamptz not null default now(),
  last_used_at  timestamptz
);

create index if not exists device_tokens_user_idx on public.device_tokens (user_id);

alter table public.device_tokens enable row level security;

drop policy if exists device_tokens_select on public.device_tokens;
drop policy if exists device_tokens_insert on public.device_tokens;
drop policy if exists device_tokens_delete on public.device_tokens;

create policy device_tokens_select on public.device_tokens
  for select using (auth.uid() = user_id);
create policy device_tokens_insert on public.device_tokens
  for insert with check (auth.uid() = user_id);
create policy device_tokens_delete on public.device_tokens
  for delete using (auth.uid() = user_id);

-- ------------------------------------------------------------
--  Kulun kirjaus laitetunnisteella.
--
--  security definer: funktio ohittaa RLS:n, mutta kirjoittaa vain
--  sille kayttajalle jonka tunniste tasmaa. search_path sisaltaa
--  extensions-skeeman, koska pgcrypto (digest) asuu siella.
-- ------------------------------------------------------------
-- Rahasumma valmiiksi muotoiltuna ilmoitusta varten.
create or replace function public.fmt_eur(cents integer)
returns text
language sql
immutable
as $fn$
  select replace(to_char(cents / 100.0, 'FM9999999990.00'), '.', ',') || ' €';
$fn$;

create or replace function public.log_expense(
  p_token       text,
  p_amount      numeric,
  p_category    text,
  p_description text default null,
  p_occurred_on date default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $fn$
declare
  v_hash     text;
  v_token    public.device_tokens%rowtype;
  v_category public.categories%rowtype;
  v_cents    integer;
  v_date     date;
  v_month    text;
  v_spent    integer;
  v_budget   integer;
  v_left     integer;
  v_message  text;
begin
  if p_token is null or length(p_token) < 20 then
    return jsonb_build_object('ok', false, 'error', 'Virheellinen laitetunniste',
      'message', 'Virhe: laitetunniste puuttuu tai on liian lyhyt');
  end if;

  v_hash := encode(digest(p_token, 'sha256'), 'hex');

  select * into v_token from public.device_tokens where token_hash = v_hash;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'Tuntematon laitetunniste',
      'message', 'Virhe: tuntematon laitetunniste — luo uusi sovelluksen asetuksista');
  end if;

  v_cents := round(p_amount * 100);
  if v_cents is null or v_cents <= 0 or v_cents > 100000000 then
    return jsonb_build_object('ok', false, 'error', 'Summan pitää olla suurempi kuin nolla',
      'message', 'Virhe: summan pitää olla suurempi kuin nolla');
  end if;

  v_date  := coalesce(p_occurred_on, current_date);
  v_month := to_char(v_date, 'YYYY-MM');

  select * into v_category
  from public.categories
  where user_id = v_token.user_id
    and lower(btrim(name)) = lower(btrim(coalesce(p_category, '')))
    and not archived;

  if not found then
    return jsonb_build_object('ok', false,
      'error', format('Kategoriaa "%s" ei löydy', coalesce(p_category, '')),
      'message', format('Virhe: kategoriaa "%s" ei löydy', coalesce(p_category, '')));
  end if;

  insert into public.transactions (user_id, category_id, amount_cents, occurred_on, description)
  values (
    v_token.user_id,
    v_category.id,
    v_cents,
    v_date,
    nullif(btrim(coalesce(p_description, '')), '')
  );

  update public.device_tokens set last_used_at = now() where id = v_token.id;

  select coalesce(sum(amount_cents), 0) into v_spent
  from public.transactions
  where user_id = v_token.user_id
    and category_id = v_category.id
    and to_char(occurred_on, 'YYYY-MM') = v_month;

  select amount_cents into v_budget
  from public.budgets
  where category_id = v_category.id and year_month = v_month;
  if v_budget is null then
    select amount_cents into v_budget
    from public.budgets
    where category_id = v_category.id and year_month is null;
  end if;

  -- Valmis viesti pikakomennon ilmoitukseen: silloin pikakomennossa ei
  -- tarvita If-haaraa lainkaan, vaan se nayttaa taman sellaisenaan.
  v_message := format('Kirjattu %s · %s', public.fmt_eur(v_cents), v_category.name);
  if v_budget is not null then
    v_left := v_budget - v_spent;
    if v_left >= 0 then
      v_message := v_message || format(' — budjetista jäljellä %s', public.fmt_eur(v_left));
    else
      v_message := v_message || format(' — budjetti ylittynyt %s', public.fmt_eur(-v_left));
    end if;
  end if;

  return jsonb_build_object(
    'ok', true,
    'message', v_message,
    'category', v_category.name,
    'amount_cents', v_cents,
    'occurred_on', v_date,
    'month_spent_cents', v_spent,
    'budget_cents', v_budget,
    'remaining_cents', case when v_budget is null then null else v_budget - v_spent end
  );
end;
$fn$;

create or replace function public.list_expense_categories(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $fn$
declare
  v_hash  text;
  v_token public.device_tokens%rowtype;
  v_names jsonb;
begin
  if p_token is null or length(p_token) < 20 then
    return jsonb_build_object('ok', false, 'categories', '[]'::jsonb,
      'message', 'Virhe: laitetunniste puuttuu tai on liian lyhyt');
  end if;

  v_hash := encode(digest(p_token, 'sha256'), 'hex');

  select * into v_token from public.device_tokens where token_hash = v_hash;
  if not found then
    return jsonb_build_object('ok', false, 'categories', '[]'::jsonb,
      'message', 'Virhe: tuntematon laitetunniste');
  end if;

  select coalesce(jsonb_agg(name order by sort_order, created_at), '[]'::jsonb)
  into v_names
  from public.categories
  where user_id = v_token.user_id and not archived;

  return jsonb_build_object('ok', true, 'categories', v_names, 'message', 'ok');
end;
$fn$;

grant execute on function public.log_expense(text, numeric, text, text, date) to anon, authenticated;
grant execute on function public.list_expense_categories(text) to anon, authenticated;
grant execute on function public.fmt_eur(integer) to anon, authenticated;

-- ------------------------------------------------------------
--  VALMIS. Ei valmiita kategorioita - luot ne itse sovelluksessa.
-- ------------------------------------------------------------
