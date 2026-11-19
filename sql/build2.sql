-- ============================================================
--  Otso - Expenses, build 2 (19 Nov 2026): fixed monthly costs. Paste the whole file into the Supabase
--  SQL Editor and Run.
--
--  Alex, 19 Nov 2026: only the rent is fixed, in a category of its own, Vuokra; its 875 € moves there
--  from Asuminen. A fixed cost counts as expected from the 1st (paying it changes nothing), and only
--  day-to-day spending drives the pace and the forecast's straight line.
--
--  Only adds: a column, a category, two RPC answers with new keys (the same RPCs, the same arguments,
--  create or replace, never an overload; every key Otso and the Shortcut read stays). The data steps
--  (sections 2-4) touch only Alex's Asuminen and Vuokra. Idempotent: running it twice changes nothing
--  more (see each section for the one exception).
--  Before: python tools/contract_test.py --preview      After: python tools/contract_test.py --after
--  Undo: the rollback at the end of this file (commented out).
--
--  0. Preview (read-only)        3. Budgets: Vuokra 875 €, Asuminen 875 € less
--  1. categories.fixed           4. The rent moves to Vuokra
--  2. The Vuokra category        5. expense_overview and list_expenses with `fixed`
-- ============================================================


-- ------------------------------------------------------------
--  0. Preview: run these on their own first (select the lines without the "--" and Run selected). They
--     change nothing. What tools/contract_test.py --preview read on 19 Nov 2026 is noted under each.
-- ------------------------------------------------------------
--  What moves to Vuokra: Asuminen's expenses of exactly 875,00 €.
--
--    select t.occurred_on, t.amount_cents, t.description, t.created_at
--    from public.transactions t
--    join public.categories a on a.id = t.category_id
--    where lower(btrim(a.name)) = 'asuminen' and t.amount_cents = 87500
--    order by t.occurred_on;
--
--    19 Nov 2026: one row, 2 Nov 2026, 875,00 €, logged in the app. Asuminen's other 10 expenses in the
--    last year (10-25 € each) stay.
--
--  Asuminen's budgets now, and after section 3:
--
--    select b.year_month, b.amount_cents as now_cents,
--           case when b.amount_cents >= 87500 then b.amount_cents - 87500 else b.amount_cents end as after_cents
--    from public.budgets b
--    join public.categories a on a.id = b.category_id
--    where lower(btrim(a.name)) = 'asuminen'
--    order by b.year_month nulls first;
--
--    19 Nov 2026: every month 935,00 € -> 60,00 € (935 = 60 + the rent). September 2026 has its own
--    60,00 €: it never had the rent in it, so it stays, and Vuokra gets 0 € for September. Vuokra gets
--    875,00 € every month. Every month's category budgets add up to what they did before:
--    November 1 730 € (Asuminen 60 + Vuokra 875 = the old 935), September 940 €.
--
--  The whole-month budget (build 1b), which expense_overview's budget_total_cents now follows when set:
--
--    select year_month, amount_cents from public.monthly_budgets order by year_month nulls first;


-- ------------------------------------------------------------
--  1. categories.fixed: a fixed monthly cost. The colour column stays (backups carry it), but the app no
--     longer shows or writes it: new categories get the app's old amber rather than the table's indigo.
-- ------------------------------------------------------------
alter table public.categories add column if not exists fixed boolean not null default false;
alter table public.categories alter column color set default '#f5b544';


-- ------------------------------------------------------------
--  2. Vuokra, for the one user: the user_id comes from his Asuminen. It goes last in the order (as the app
--     adds a category: the highest sort_order + 10), and it's fixed. Running this again finds Vuokra and
--     only makes sure it's fixed (so unticking "Fixed monthly cost" in the app is undone by a re-run).
-- ------------------------------------------------------------
insert into public.categories (user_id, name, color, sort_order, archived, ask_description, fixed)
select a.user_id, 'Vuokra', '#f5b544',
       (select coalesce(max(c.sort_order), 0) + 10 from public.categories c where c.user_id = a.user_id),
       false, false, true
from public.categories a
where lower(btrim(a.name)) = 'asuminen'
  and not exists (select 1 from public.categories v
                  where v.user_id = a.user_id and lower(btrim(v.name)) = 'vuokra');

update public.categories set fixed = true
where lower(btrim(name)) = 'vuokra' and not fixed;


-- ------------------------------------------------------------
--  3. Budgets. Category budgets are rows in public.budgets: year_month null is every month's, 'YYYY-MM' a
--     month's own (it wins over every month's). Only while Vuokra has no every-month budget yet, so a re-run
--     changes nothing:
--     - Vuokra: 875 € every month;
--     - Asuminen: 875 € less in every row that had the rent in it (875 € or more): every month's
--       935 -> 60 €, and any month of its own that was that high;
--     - a month whose own Asuminen budget is under 875 € never had the rent in it: Vuokra gets 0 € for
--       that month, so its total stays as it was (19 Nov 2026: September 2026).
-- ------------------------------------------------------------
do $do$
declare
  r record;
begin
  for r in
    select a.user_id, a.id as asuminen_id, v.id as vuokra_id
    from public.categories a
    join public.categories v on v.user_id = a.user_id and lower(btrim(v.name)) = 'vuokra'
    where lower(btrim(a.name)) = 'asuminen'
      and not exists (select 1 from public.budgets b where b.category_id = v.id and b.year_month is null)
  loop
    insert into public.budgets (user_id, category_id, year_month, amount_cents)
    values (r.user_id, r.vuokra_id, null, 87500);

    insert into public.budgets (user_id, category_id, year_month, amount_cents)
    select r.user_id, r.vuokra_id, b.year_month, 0
    from public.budgets b
    where b.category_id = r.asuminen_id and b.year_month is not null and b.amount_cents < 87500
      and not exists (select 1 from public.budgets vb where vb.category_id = r.vuokra_id and vb.year_month = b.year_month);

    update public.budgets set amount_cents = amount_cents - 87500
    where category_id = r.asuminen_id and amount_cents >= 87500;
  end loop;
end
$do$;


-- ------------------------------------------------------------
--  4. The rent moves: Asuminen's expenses of exactly 875,00 € go to Vuokra (19 Nov 2026: one, 2 Nov).
--     A re-run moves only new ones (a rent logged to Asuminen since).
-- ------------------------------------------------------------
update public.transactions t
set category_id = v.id
from public.categories a
join public.categories v on v.user_id = a.user_id and lower(btrim(v.name)) = 'vuokra'
where t.category_id = a.id
  and lower(btrim(a.name)) = 'asuminen'
  and t.amount_cents = 87500;


-- ------------------------------------------------------------
--  5. The RPCs Otso reads, with the same arguments and every key they had:
--     expense_overview: each category says `fixed`; `fixed_cents` is the fixed costs expected this month
--       (each one: what's logged, or its budget, else last month's amount, when that's more; a past month
--       or an archived category: what was logged); `forecast_cents` is fixed_cents plus a straight line of
--       the day-to-day spending only (from the 5th, as before); `budget_total_cents` is the whole-month
--       budget when one is set (the month's own, else every month's), else the categories' budgets added up.
--     list_expenses: each expense says whether its category is `fixed`.
-- ------------------------------------------------------------
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
  v_monthly  integer;
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

  -- The whole-month budget (build 1b), when that table is there and one is set.
  if to_regclass('public.monthly_budgets') is not null then
    execute 'select coalesce(
               (select amount_cents from public.monthly_budgets where user_id = $1 and year_month = $2),
               (select amount_cents from public.monthly_budgets where user_id = $1 and year_month is null))'
      into v_monthly using v_user, v_month;
  end if;
  v_budget := coalesce(v_monthly, v_budget);

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
  v_user  uuid;
  v_rows  jsonb;
  v_limit integer := least(greatest(coalesce(p_limit, 200), 1), 500);
  v_cat   text := nullif(lower(btrim(regexp_replace(coalesce(p_category, ''), '\s*\(kuvaus\)\s*$', '', 'i'))), '');
  v_count integer;
begin
  v_user := public.token_reader(p_token);
  if v_user is null then
    return jsonb_build_object('ok', false, 'code', 'no_read', 'expenses', '[]'::jsonb,
      'message', 'Virhe: tunnisteella ei ole lukuoikeutta');
  end if;
  if p_from is null or p_to is null or p_to < p_from or p_to - p_from > 400 then
    return jsonb_build_object('ok', false, 'code', 'bad_range', 'expenses', '[]'::jsonb,
      'message', 'Virhe: aikavali puuttuu tai on yli 400 paivaa');
  end if;

  select count(*) into v_count
  from public.transactions tr
  join public.categories c on c.id = tr.category_id
  where tr.user_id = v_user and tr.occurred_on between p_from and p_to
    and (v_cat is null or lower(btrim(c.name)) = v_cat);

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', t.id,
           'occurred_on', t.occurred_on,
           'category', t.category_name,
           'amount_cents', t.amount_cents,
           'description', t.description,
           'source', t.source,
           'fixed', t.fixed
         ) order by t.occurred_on desc, t.created_at desc), '[]'::jsonb)
  into v_rows
  from (
    select tr.id, tr.occurred_on, tr.created_at, tr.amount_cents, tr.description, c.name as category_name, c.fixed,
           coalesce(dt.name, case when tr.device_token_id is null then 'app' else 'removed token' end) as source
    from public.transactions tr
    join public.categories c on c.id = tr.category_id
    left join public.device_tokens dt on dt.id = tr.device_token_id
    where tr.user_id = v_user and tr.occurred_on between p_from and p_to
      and (v_cat is null or lower(btrim(c.name)) = v_cat)
    order by tr.occurred_on desc, tr.created_at desc
    limit v_limit
  ) t;

  return jsonb_build_object('ok', true, 'code', 'ok', 'expenses', v_rows, 'message', 'ok',
    'truncated', v_count > v_limit, 'total_rows', v_count);
end;
$fn$;

grant execute on function public.expense_overview(text, text) to anon, authenticated;
grant execute on function public.list_expenses(text, date, date, text, integer) to anon, authenticated;

-- Done. Next: python tools/contract_test.py --after, then merge round-19nov (app 2.2.0) to deploy.


-- ============================================================
--  Rollback (commented out: only to undo build 2). In this order, the RPCs first: they read the column
--  that the last step drops. The app 2.2.0 carries on without the column (Vuokra by name stays fixed).
-- ============================================================
--  1. expense_overview and list_expenses as build 1 had them: paste their two `create or replace
--     function` blocks from section 2 of sql/build1.sql again.
--
--  2. The rent back to Asuminen:
--     update public.transactions t set category_id = a.id
--     from public.categories v
--     join public.categories a on a.user_id = v.user_id and lower(btrim(a.name)) = 'asuminen'
--     where t.category_id = v.id and lower(btrim(v.name)) = 'vuokra';
--
--  3. Asuminen gets the 875 € back in the rows that lost it (every month's, and any month of its own
--     where Vuokra got no 0 € row), then Vuokra's budgets go:
--     update public.budgets b set amount_cents = b.amount_cents + 87500
--     from public.categories a
--     join public.categories v on v.user_id = a.user_id and lower(btrim(v.name)) = 'vuokra'
--     where b.category_id = a.id and lower(btrim(a.name)) = 'asuminen'
--       and not exists (select 1 from public.budgets vb where vb.category_id = v.id and vb.year_month = b.year_month);
--     delete from public.budgets b using public.categories v
--     where b.category_id = v.id and lower(btrim(v.name)) = 'vuokra';
--
--  4. delete from public.categories where lower(btrim(name)) = 'vuokra';
--     (refused while it still has expenses: step 2 first; or archive it in the app instead)
--
--  5. alter table public.categories alter column color set default '#6366f1';
--     alter table public.categories drop column if exists fixed;
