# Otso - Expenses: ledger

Re-read `anchor.md` before each step.

## Done
- **9 Nov.** Planning:
  - the deep scan (`scan.md`);
  - 88 ideas (`ideas.md`);
  - four looks with logos (`looks.html`);
  - the LLM council (`verdict.md`): 31 approved, 29 later, 28 denied.
- **10 Nov.** Alex's choices:
  - look **A Kulta**;
  - all three reversals: yes;
  - all four defaults: yes (`anchor.md`).
- **10 Nov.** Build 1, on branch `otso-expenses`.
  - **Slice 1: foundations.**
    - `sql/build1.sql`: F1, F2, F3, F7, F9, plus the income/paydays and otso_notes tables. Rollback in
      `sql/rollback-build1.sql`.
    - `tools/contract_test.py` passes against the live project, both read-only and the 0,01 € write and
      undo.
    - F5: future months open. F6: supabase-js 2.118.0 and SheetJS 0.18.5 pinned and hash-checked, with a
      CSP. F7: the token docs now say what a token can really do (app, README, PIKAKOMENTO). F10: a
      truncation flag.
    - Otso's side, in jarvis `7e6af5e` (deployed): codes matched before Finnish words, and F4 chat Undo.
  - **Slice 2: shell.**
    - D1: name, icons (`tools/make_icons.py`) and manifest. The Pages path is kept.
    - D2: English, with the strings in the views and no i18n layer.
    - D3: Month, Expenses and Otso tabs plus a + button; the app opens on Month.
    - D4: own icons. D5: a real dialog with a focus trap, aria-current, AA contrast, labels, and a
      keyboard way to reorder. D10: settings in six parts.
    - L1: logging is the amount, then one tap on the category, with Undo. L14: Find with totals and
      source filters.
  - **Slice 3: Otso inside.**
    - O4: source badges. O6: Undo for what Otso logged in the last 7 days.
    - O3/N6 flags. The dry run on real history showed "3x the median" flagged 10 expenses in 45 days.
      The rule is now "2x the category's 90th percentile, and 30 € or more": 2 in 45 days. A double needs
      the same category and not two different shop names.
    - O1: the read card. Otso's `expenses_desk` writes it only when a threshold is crossed. In the
      Oct-Nov dry run, ordinary days get no card and trip weeks don't count.
    - O7: the monthly letter. N15: in-app cards never push.
  - **Slice 4: money.**
    - I1/I7: income and paydays. I2/I8: what's left, and the share kept.
    - N2/N8: "usually X by the Nth" and the forecast from history, from day 1. In the dry run, single
      expenses of 100 € or more are left out of "usual". With them, the forecast on 3 Oct was 1 904 €;
      without them it was 1 210-1 245 € from the 3rd on. The month ended at 1 277 €.
    - O8: a category's expenses, biggest first.
  - Verified in `tools/preview.html` (a fake database with example data): phone and desktop width, no
    console errors.
  - Not verified: the real sign-in and the real data in the new app (that needs Alex's login).
  - Build 1 went live: `sql/build1.sql` pasted, `otso-expenses` merged to `main` (34e89a0).
- **10 Nov.** After build 1, on `otso-expenses`, each merged to `main` (live):
  - **2.0.1** (cf3fcfc): the loading screen and the iPhone launch images (the bear in amber rays and the
    name), and a solid black band over the top edge so iOS doesn't blur it.
  - **2.1.0** (5f7d6f2): `sql/build1b.sql`, one budget for the whole month (`monthly_budgets`: every
    month, and a month's own), with a month picker in Budgets; the laptop layout (a rail, two columns,
    sheets as dialogs); the name on the loading screen; the header's fade off the Find box.
    Whether `build1b.sql` is pasted isn't written down anywhere: the app says so in Settings, Budgets
    when it isn't.
  - **13cc4c4**: controls without pills (`controls.html`): word tabs, small-caps status words, grouped
    lists with word actions. Live as 2.1.0: the version wasn't raised.
- **19 Nov.** Round of fixes, on branch `round-19nov` (from 13cc4c4), **2.2.0**. Alex's answer: only the
  rent is fixed, in its own category Vuokra, and its 875 € moves there from Asuminen.
  - **E1**: no coloured category dots or colour pickers anywhere (Month, Expenses, the sheets, Settings),
    nor the status dots in Budgets and Income; the rows lose that column. The `color` column stays in the
    table and in backups; the app no longer writes it.
  - **E2**: logging is the amount, a native category list starting on "Choose a category" (disabled),
    the day and note, and one Save; Undo in the toast as before. The edit sheet uses the same list (an
    archived category says "(archived)").
  - **E3**: `sql/build2.sql`. `categories.fixed`; Vuokra (fixed, last in the order); Asuminen's 875,00 €
    expenses move to it; budgets: Vuokra 875 € every month, Asuminen's every-month 935 → 60 €, and
    Vuokra 0 € in September 2026 (Asuminen's own 60 € there never had the rent), so every month's
    category budgets add up as before. `expense_overview` rows carry `fixed`, the answer `fixed_cents`; the
    forecast is the fixed costs expected plus a straight line of day-to-day spending; `budget_total_cents`
    follows the whole-month budget when one is set. `list_expenses` rows carry `fixed`. Rollback at the
    file's end. `tools/contract_test.py --preview` (read-only) shows what it would move;
    `--after` checks it.
  - The app: a fixed cost counts as expected from the 1st (logged, else its budget, else last month's;
    a past month is what was logged). The pace, "usually", the day rays and the "odd" flag use day-to-day
    spending only ("logged twice" still flags the rent). Left = budget - fixed expected - day-to-day spent,
    in the hero and in Income's "Left now", so paying the rent changes nothing. Vuokra's row reads
    "875,00 € of 875 €, 1 expense · fixed", no bar, never red; the forecast "Heading for about 1 480 € by
    the month's end: 875 € fixed, about 605 € day-to-day" ("(not logged yet)" before it's logged). Settings:
    "Fixed monthly cost" when editing a category. Before build2.sql the app loads without the column and
    counts a category named Vuokra as fixed.
  - Decisions: Vuokra goes last in the category order (as the app adds one); fixed rows come after the
    day-to-day ones on Month; the hero now says what's left of the budget, not only what's over; a restored
    backup keeps its colours, nothing else writes one; new categories default to the old amber in the table.
  - Verified in `tools/preview.html` (fake database, now with Vuokra; `?nofixed` is the database before
    build2, `?rent=later` the rent not logged yet): 390 px and 1280 px, log and edit sheets, Month,
    Settings' Categories, Budgets and Income. `build2.sql` parses with Postgres's own parser (pglast), but
    hasn't run on a real database: there's no staging one.

## Waiting on Alex (19 Nov round)
1. `python tools/contract_test.py --preview`: read-only, shows the rent row(s) and budgets build2 changes.
2. Paste `sql/build2.sql` into Supabase's SQL Editor and Run; then `python tools/contract_test.py --after`.
3. Merge `round-19nov` into `main` (deploys 2.2.0); open the app twice.

## Then
Choose from what Alex actually opened. First candidate: Ask Otso as a mailbox through otso_notes. Others:
L5/L6 recurring, I3 runway, D6/N3 charts, D8 instant open.
