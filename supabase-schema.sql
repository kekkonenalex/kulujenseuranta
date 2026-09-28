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

-- ============================================================
--  LUKUOIKEUS (Otso-avustaja)
--
--  Tavallinen laitetunniste voi vain kirjata. Tunniste jolla on
--  can_read = true voi lisaksi LUKEA kuukauden yhteenvedon ja
--  kirjauslistan omasta datastaan. Muokata tai poistaa ei voi
--  kumpikaan. Oletus on false, joten vanhat tunnisteet eivat muutu.
--
--  Taman osion voi ajaa erikseen: se on idempotentti.
-- ============================================================

alter table public.device_tokens add column if not exists can_read boolean not null default false;

-- Kayttaja, jolle lukuoikeudellinen tunniste kuuluu, tai null.
-- Vain alla olevat funktiot kutsuvat tata; sita ei voi kutsua ulkoa.
create or replace function public.token_reader(p_token text)
returns uuid
language plpgsql
security definer
set search_path = public, extensions
as $fn$
declare
  v_token public.device_tokens%rowtype;
begin
  if p_token is null or length(p_token) < 20 then
    return null;
  end if;
  select * into v_token from public.device_tokens
  where token_hash = encode(digest(p_token, 'sha256'), 'hex');
  if not found or not v_token.can_read then
    return null;
  end if;
  update public.device_tokens set last_used_at = now() where id = v_token.id;
  return v_token.user_id;
end;
$fn$;

revoke execute on function public.token_reader(text) from public, anon, authenticated;

-- Kuukauden yhteenveto: kategorioittain kulut, budjetti (kuukauden oma tai
-- perusbudjetti) ja edellinen kuukausi, seka kokonaissummat ja ennuste
-- samalla saannolla kuin sovelluksessa (vasta 5. paivasta alkaen, tulevalle
-- paivalle kirjatut lisataan sellaisenaan).
create or replace function public.expense_overview(p_token text, p_month text default null)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $fn$
declare
  v_user     uuid;
  v_month    text;
  v_start    date;
  v_end      date;
  v_pstart   date;
  v_rows     jsonb;
  v_total    integer;
  v_prev     integer;
  v_budget   integer;
  v_so_far   integer;
  v_later    integer;
  v_day      integer;
  v_days     integer;
  v_forecast integer;
begin
  v_user := public.token_reader(p_token);
  if v_user is null then
    return jsonb_build_object('ok', false, 'message', 'Virhe: tunnisteella ei ole lukuoikeutta');
  end if;

  v_month := coalesce(nullif(btrim(coalesce(p_month, '')), ''), to_char(current_date, 'YYYY-MM'));
  if v_month !~ '^[0-9]{4}-(0[1-9]|1[0-2])$' then
    return jsonb_build_object('ok', false, 'message', 'Virhe: kuukausi muodossa VVVV-KK');
  end if;
  v_start  := to_date(v_month || '-01', 'YYYY-MM-DD');
  v_end    := (v_start + interval '1 month')::date;
  v_pstart := (v_start - interval '1 month')::date;

  with cats as (
    select id, name, sort_order, created_at, archived from public.categories where user_id = v_user
  ), spent as (
    select category_id, sum(amount_cents)::integer as cents, count(*)::integer as n
    from public.transactions
    where user_id = v_user and occurred_on >= v_start and occurred_on < v_end
    group by category_id
  ), prev as (
    select category_id, sum(amount_cents)::integer as cents
    from public.transactions
    where user_id = v_user and occurred_on >= v_pstart and occurred_on < v_start
    group by category_id
  ), bud as (
    select c.id,
           coalesce(
             (select b.amount_cents from public.budgets b where b.category_id = c.id and b.year_month = v_month),
             (select b.amount_cents from public.budgets b where b.category_id = c.id and b.year_month is null)
           ) as cents
    from cats c
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'category', c.name,
           'spent_cents', coalesce(s.cents, 0),
           'count', coalesce(s.n, 0),
           'budget_cents', b.cents,
           'previous_cents', coalesce(p.cents, 0)
         ) order by c.sort_order, c.created_at), '[]'::jsonb)
  into v_rows
  from cats c
  left join spent s on s.category_id = c.id
  left join prev p on p.category_id = c.id
  left join bud b on b.id = c.id
  where not c.archived or coalesce(s.cents, 0) > 0 or coalesce(p.cents, 0) > 0;

  select coalesce(sum(amount_cents), 0) into v_total from public.transactions
  where user_id = v_user and occurred_on >= v_start and occurred_on < v_end;
  select coalesce(sum(amount_cents), 0) into v_prev from public.transactions
  where user_id = v_user and occurred_on >= v_pstart and occurred_on < v_start;
  select sum((r ->> 'budget_cents')::integer) into v_budget
  from jsonb_array_elements(v_rows) r where r ->> 'budget_cents' is not null;

  v_forecast := null;
  if v_month = to_char(current_date, 'YYYY-MM') then
    v_day  := extract(day from current_date)::integer;
    v_days := extract(day from (v_end - 1))::integer;
    if v_day >= 5 then
      select coalesce(sum(amount_cents) filter (where occurred_on <= current_date), 0),
             coalesce(sum(amount_cents) filter (where occurred_on > current_date), 0)
      into v_so_far, v_later
      from public.transactions
      where user_id = v_user and occurred_on >= v_start and occurred_on < v_end;
      v_forecast := round(v_so_far::numeric / v_day * v_days) + v_later;
    end if;
  end if;

  return jsonb_build_object(
    'ok', true,
    'month', v_month,
    'categories', v_rows,
    'total_cents', v_total,
    'previous_total_cents', v_prev,
    'budget_total_cents', v_budget,
    'forecast_cents', v_forecast,
    'message', 'ok'
  );
end;
$fn$;

-- Kirjaukset aikavalilta, uusin ensin, valinnaisesti yhdesta kategoriasta.
create or replace function public.list_expenses(
  p_token    text,
  p_from     date,
  p_to       date,
  p_category text default null,
  p_limit    integer default 200
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $fn$
declare
  v_user uuid;
  v_rows jsonb;
begin
  v_user := public.token_reader(p_token);
  if v_user is null then
    return jsonb_build_object('ok', false, 'expenses', '[]'::jsonb,
      'message', 'Virhe: tunnisteella ei ole lukuoikeutta');
  end if;
  if p_from is null or p_to is null or p_to < p_from or p_to - p_from > 400 then
    return jsonb_build_object('ok', false, 'expenses', '[]'::jsonb,
      'message', 'Virhe: aikavali puuttuu tai on yli 400 paivaa');
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'occurred_on', t.occurred_on,
           'category', t.category_name,
           'amount_cents', t.amount_cents,
           'description', t.description
         ) order by t.occurred_on desc, t.created_at desc), '[]'::jsonb)
  into v_rows
  from (
    select tr.occurred_on, tr.created_at, tr.amount_cents, tr.description, c.name as category_name
    from public.transactions tr
    join public.categories c on c.id = tr.category_id
    where tr.user_id = v_user and tr.occurred_on between p_from and p_to
      and (p_category is null or lower(btrim(c.name)) = lower(btrim(p_category)))
    order by tr.occurred_on desc, tr.created_at desc
    limit least(greatest(coalesce(p_limit, 200), 1), 500)
  ) t;

  return jsonb_build_object('ok', true, 'expenses', v_rows, 'message', 'ok');
end;
$fn$;

grant execute on function public.expense_overview(text, text) to anon, authenticated;
grant execute on function public.list_expenses(text, date, date, text, integer) to anon, authenticated;

-- ------------------------------------------------------------
--  VALMIS. Ei valmiita kategorioita - luot ne itse sovelluksessa.
-- ------------------------------------------------------------
