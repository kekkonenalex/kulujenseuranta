-- ============================================================
--  Otso - Expenses, build 1b (10 Nov 2026): one budget for the whole month.
--
--  A monthly budget for everything: one amount for every month (year_month null), and a month of its own
--  where that month differs ('2026-12'). The category budgets stay as they are, inside it. Only adds a
--  table: the Shortcut, Otso and every RPC are untouched. Idempotent.
--  Before and after: python tools/contract_test.py --after
--  Undo: drop table public.monthly_budgets;  (the app then goes back to the categories' sum)
-- ============================================================

create table if not exists public.monthly_budgets (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references auth.users (id) on delete cascade,
  year_month    text check (year_month is null or year_month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  amount_cents  integer not null check (amount_cents >= 0 and amount_cents <= 100000000),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- One every-month budget per user, and one per user and month.
create unique index if not exists monthly_budgets_default_uniq on public.monthly_budgets (user_id) where year_month is null;
create unique index if not exists monthly_budgets_month_uniq on public.monthly_budgets (user_id, year_month) where year_month is not null;

drop trigger if exists monthly_budgets_set_updated_at on public.monthly_budgets;
create trigger monthly_budgets_set_updated_at
  before update on public.monthly_budgets
  for each row execute function public.set_updated_at();

alter table public.monthly_budgets enable row level security;
drop policy if exists monthly_budgets_all on public.monthly_budgets;
create policy monthly_budgets_all on public.monthly_budgets
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
