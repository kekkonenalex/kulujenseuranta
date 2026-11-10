# Otso - Expenses

The Finnish documentation of the earlier version (v1.7, *kulujenseuranta*) is in [README.fi.md](README.fi.md).

A personal expense app (once *kulujenseuranta*), in the Otso family. Most expenses arrive without opening
it: Apple Pay taps through Otso, and the iPhone Shortcut. The app is where the month is reviewed: what's
spent, where it's heading, what Otso logged and noticed, and what's left of the income.

- **Month** (the app opens here):
  - what's spent, drawn as one ray a day;
  - what's usual by this day, and where the month is heading, from your own history;
  - Otso's read, when something crosses a threshold;
  - income, what's left and the share kept;
  - each category against its budget. Tap a category for its expenses, biggest first, and its budget.
- **Expenses**:
  - the month by day;
  - Find, with totals ("coffee", "wolt", "12,50", "october");
  - filters: You, Shortcut, Otso, Flagged. Each expense shows where it came from. Tap one to change or
    delete it, with Undo.
- **Otso**:
  - Otso's read;
  - what looks wrong (logged twice, or far bigger than usual);
  - what Otso logged this week, with Undo;
  - its monthly letters.

  Nothing here pushes: Otso's messages stay in Telegram.
- **+** logs an expense: type the amount, tap the category, and it's saved.
- **Settings** (the icon at the top): Categories, Budgets, Income (paydays), Connections (tokens), Data
  (Excel, backup), Account.

The design is look A, "Kulta": true black, Otso's aurora in amber, and the bear drawn in rays. See
`docs/otso-expenses/` for the scan, the brainstorm, the four looks, the council's verdict and the ledger.

## Tech

| Part | Choice |
|---|---|
| UI | plain HTML + CSS + JavaScript modules, **no build step** |
| Data | Supabase (Postgres) with Row Level Security |
| Sign-in | email + password; the session stays in the browser |
| Hosting | GitHub Pages, `main` from the root. **Pushing `main` deploys.** |
| Libraries | `supabase-js` 2.118.0 and SheetJS 0.18.5 from jsDelivr, pinned and checked against their hashes; a Content-Security-Policy allows nothing else |
| Fonts | Schibsted Grotesk and Atkinson Hyperlegible, served from `fonts/` (OFL) |

Money is stored as **integer cents**: 0.1 + 0.2 isn't 0.3 in floating point.

```
index.html            the page: screens, tab bar, the sheet, the policy
styles.css            look A
sw.js                 service worker (the app's shell, offline start)
manifest.webmanifest  install as an app
sql/build1.sql        build 1's database changes (and sql/rollback-build1.sql)
supabase-schema.sql   the whole schema, idempotent
tools/contract_test.py  checks the RPCs the Shortcut and Otso use, against the live project
tools/preview.html    the app on a fake database with example data (no sign-in)
tools/make_icons.py   draws the icons
js/
  config.js     Supabase URL + publishable key, APP_VERSION
  app.js        start, sign-in, the views, the month
  db.js         every Supabase call
  state.js      the state, and everything worked out from it: budgets, the usual, the forecast,
                income and what's left, sources, flags
  format.js     money (12,40 €), dates, English words
  ui-common.js  the sheet (a real dialog: focus kept inside, Escape closes), the toast with Undo
  icons.js      the app's own icons and the bear mark
  ui-month.js, ui-expenses.js, ui-otso.js, ui-log.js, ui-settings.js   the screens
  export.js     Excel and the JSON backup
```

## Releasing

1. Work on a branch; merge to `main` to deploy (GitHub Pages, about a minute).
2. Raise `VERSION` in `sw.js` and `APP_VERSION` in `js/config.js` together, and list any new file in
   `sw.js`'s `SHELL`. Phones pick the new version up on the second open.

## Database changes: there's no staging database

Every SQL paste changes the live project that the app, the Shortcut and Otso use at that moment.
So:

- SQL only **adds**: new tables, new columns, new keys in answers. The RPCs keep their names and arguments,
  replaced with `create or replace` and never overloaded.
- Before and after a paste, run the contract test:

  ```bash
  python tools/contract_test.py
  ```

  After build 1, run `--after --write`. `--write` logs 0,01 € and undoes it at once.
- Every change has a rollback beside it (`sql/rollback-build1.sql`).

### Build 1 (`sql/build1.sql`)

- **Helsinki's today** in the database. Before this, an expense at 00:30 landed on yesterday, and on the
  1st it landed in last month.
- **Every RPC answer has a stable `code`.** `list_expenses` gives each expense's `id` and `source`, says
  when it cut the list at 500, and finds a "Name (kuvaus)" category.
- **Tokens** can be renamed, and their rights switched in the app. There's a new right, *Otso's notes*.
- **Checks** on colours, names and note lengths.
- **Income** and **paydays**, in tables of their own: spending stays spending in every RPC, the Shortcut
  and Otso.
- **Otso's notes** (`otso_notes`): only a token with the notes right can post them, through
  `post_otso_note` and `clear_otso_note`. The app shows them as plain text, never as markup.

## The iPhone Shortcut

Unchanged by build 1. It uses the same functions, arguments, ` (kuvaus)` marker and `message`. See
[PIKAKOMENTO.md](PIKAKOMENTO.md) (in Finnish).

What a token can do:
- **Every token** can log an expense, and take back what it logged itself within 7 days.
- **Can read**: it can also read all the expenses and budgets (`expense_overview`, `list_expenses`).
- **Otso's notes**: it can also post the notes on the Otso tab. Only Otso's token needs this.

Only a token's SHA-256 is stored. The token is made in the browser, shown once and forgotten.

## Otso

Otso, Alex's assistant, has a token with *Can read*, and after build 1 *Otso's notes* too. With it, Otso:
- logs Apple Pay taps and what Alex tells it, with Undo (also for expenses logged in chat);
- answers money questions;
- writes the read card (`expenses_desk`, only when something crosses a threshold, worded by code);
- keeps its monthly letter here (`expenses_month`).

## Restrictions

- Saving needs a connection. The app opens offline from its cache, but nothing is queued.
- One currency (EUR).
- The flags remember an "It's right" on the phone it was pressed on.
