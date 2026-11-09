-- ============================================================
--  Rollback of sql/build1.sql: the RPCs exactly as they were before (v1.7), and occurred_on's old default.
--  The new tables (income, paydays, otso_notes) and columns stay: nothing reads them unless the new app
--  does, and dropping them would lose data. Idempotent. Then: python tools/contract_test.py
-- ============================================================

alter table public.transactions alter column occurred_on set default current_date;

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

  select coalesce(jsonb_agg(
           case when ask_description then name || ' (kuvaus)' else name end
           order by sort_order, created_at), '[]'::jsonb)
  into v_names
  from public.categories
  where user_id = v_token.user_id and not archived;

  return jsonb_build_object('ok', true, 'categories', v_names, 'message', 'ok');
end;
$fn$;

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
  v_id       uuid;
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
    select * into v_category
    from public.categories
    where user_id = v_token.user_id
      and lower(btrim(name)) = lower(btrim(regexp_replace(
            coalesce(p_category, ''), '\s*\(kuvaus\)\s*$', '', 'i')))
      and not archived;
  end if;

  if not found then
    return jsonb_build_object('ok', false,
      'error', format('Kategoriaa "%s" ei löydy', coalesce(p_category, '')),
      'message', format('Virhe: kategoriaa "%s" ei löydy', coalesce(p_category, '')));
  end if;

  insert into public.transactions (user_id, category_id, amount_cents, occurred_on, description, device_token_id)
  values (
    v_token.user_id,
    v_category.id,
    v_cents,
    v_date,
    nullif(btrim(coalesce(p_description, '')), ''),
    v_token.id
  )
  returning id into v_id;

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
    'id', v_id,
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

create or replace function public.undo_expense(p_token text, p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $fn$
declare
  v_token public.device_tokens%rowtype;
  v_row   public.transactions%rowtype;
begin
  if p_token is null or length(p_token) < 20 then
    return jsonb_build_object('ok', false, 'message', 'Virhe: laitetunniste puuttuu tai on liian lyhyt');
  end if;
  select * into v_token from public.device_tokens
  where token_hash = encode(digest(p_token, 'sha256'), 'hex');
  if not found then
    return jsonb_build_object('ok', false, 'message', 'Virhe: tuntematon laitetunniste');
  end if;

  delete from public.transactions
  where id = p_id
    and user_id = v_token.user_id
    and device_token_id = v_token.id
    and created_at > now() - interval '7 days'
  returning * into v_row;
  if not found then
    return jsonb_build_object('ok', false,
      'message', 'Virhe: kirjausta ei löydy (vain tällä tunnisteella viikon sisällä tehdyn voi kumota)');
  end if;

  update public.device_tokens set last_used_at = now() where id = v_token.id;
  return jsonb_build_object('ok', true, 'amount_cents', v_row.amount_cents,
    'message', format('Poistettu %s', public.fmt_eur(v_row.amount_cents)));
end;
$fn$;

grant execute on function public.log_expense(text, numeric, text, text, date) to anon, authenticated;
grant execute on function public.list_expense_categories(text) to anon, authenticated;
grant execute on function public.expense_overview(text, text) to anon, authenticated;
grant execute on function public.list_expenses(text, date, date, text, integer) to anon, authenticated;
grant execute on function public.undo_expense(text, uuid) to anon, authenticated;
