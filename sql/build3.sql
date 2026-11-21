-- ============================================================
--  Otso - Expenses, build 3 (21 Nov 2026): a month's own category budgets move its whole budget. Paste the
--  whole file into the Supabase SQL Editor and Run.
--
--  Alex, 21 Nov 2026: "when I manually input month specific budgets to categories, those should add up to
--  that month's whole budget". September's and October's own category budgets added up to 940 € and
--  1 910 €, and both months still showed every month's 1 530 €.
--
--  expense_overview's budget_total_cents, as the app (2.2.3) counts it: the month's own whole budget when
--  set; else every month's, plus what the month's own category budgets add or take away (each one's amount
--  less the category's every-month budget); else the categories' budgets added up. Only this one function
--  changes: the same arguments and every key it had (create or replace). Idempotent.
--  After: python tools/contract_test.py --after
--  Undo: run section 5 of sql/build2.sql again (its expense_overview).
-- ============================================================

create or replace function public.expense_overview(p_token text, p_month text default null)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $fn$
declare
  v_user     uuid;
  v_today    date := public.today_hel();
  v_month    text;
  v_start    date;
  v_end      date;
  v_pstart   date;
  v_rows     jsonb;
  v_fixed    integer;
  v_total    integer;
  v_prev     integer;
  v_budget   integer;
  v_own      integer;
  v_every    integer;
  v_so_far   integer;
  v_later    integer;
  v_day      integer;
  v_days     integer;
  v_forecast integer;
begin
  v_user := public.token_reader(p_token);
  if v_user is null then
    return jsonb_build_object('ok', false, 'code', 'no_read', 'message', 'Virhe: tunnisteella ei ole lukuoikeutta');
  end if;

  v_month := coalesce(nullif(btrim(coalesce(p_month, '')), ''), to_char(v_today, 'YYYY-MM'));
  if v_month !~ '^[0-9]{4}-(0[1-9]|1[0-2])$' then
    return jsonb_build_object('ok', false, 'code', 'bad_month', 'message', 'Virhe: kuukausi muodossa VVVV-KK');
  end if;
  v_start  := to_date(v_month || '-01', 'YYYY-MM-DD');
  v_end    := (v_start + interval '1 month')::date;
  v_pstart := (v_start - interval '1 month')::date;

  with cats as (
    select id, name, sort_order, created_at, archived, fixed from public.categories where user_id = v_user
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
           'previous_cents', coalesce(p.cents, 0),
           'fixed', c.fixed
         ) order by c.sort_order, c.created_at), '[]'::jsonb),
         coalesce(sum(case
           when not c.fixed then 0
           when c.archived or v_month < to_char(v_today, 'YYYY-MM') then coalesce(s.cents, 0)
           else greatest(coalesce(s.cents, 0), coalesce(b.cents, p.cents, 0))
         end), 0)::integer
  into v_rows, v_fixed
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

  -- The whole-month budget (build 1b): the month's own when set; else every month's, moved by the month's own
  -- category budgets (each one's amount less its every-month budget, none: 0), so the categories still add up
  -- to it (build 3, 21 Nov 2026); else the categories' budgets added up (above).
  if to_regclass('public.monthly_budgets') is not null then
    execute 'select (select amount_cents from public.monthly_budgets where user_id = $1 and year_month = $2),
                    (select amount_cents from public.monthly_budgets where user_id = $1 and year_month is null)'
      into v_own, v_every using v_user, v_month;
  end if;
  if v_own is not null then
    v_budget := v_own;
  elsif v_every is not null then
    select (v_every + coalesce(sum(m.amount_cents - coalesce(d.amount_cents, 0)), 0))::integer into v_budget
    from public.budgets m
    join public.categories c on c.id = m.category_id
    left join public.budgets d on d.category_id = m.category_id and d.year_month is null
    where c.user_id = v_user and not c.archived and m.year_month = v_month;
  end if;

  v_forecast := null;
  if v_month = to_char(v_today, 'YYYY-MM') then
    v_day  := extract(day from v_today)::integer;
    v_days := extract(day from (v_end - 1))::integer;
    if v_day >= 5 then
      select coalesce(sum(t.amount_cents) filter (where t.occurred_on <= v_today), 0),
             coalesce(sum(t.amount_cents) filter (where t.occurred_on > v_today), 0)
      into v_so_far, v_later
      from public.transactions t
      join public.categories c on c.id = t.category_id
      where t.user_id = v_user and t.occurred_on >= v_start and t.occurred_on < v_end and not c.fixed;
      v_forecast := v_fixed + round(v_so_far::numeric / v_day * v_days)::integer + v_later;
    end if;
  end if;

  return jsonb_build_object(
    'ok', true,
    'code', 'ok',
    'month', v_month,
    'categories', v_rows,
    'total_cents', v_total,
    'previous_total_cents', v_prev,
    'budget_total_cents', v_budget,
    'fixed_cents', v_fixed,
    'forecast_cents', v_forecast,
    'message', 'ok'
  );
end;
$fn$;

grant execute on function public.expense_overview(text, text) to anon, authenticated;
