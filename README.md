# Kulujenseuranta: Personal Expense Tracker (PWA)

🇫🇮 Full Finnish documentation and user guide: [README.fi.md](README.fi.md)

A mobile-first progressive web app for logging expenses right after a purchase, in three taps. It includes monthly summaries, category budgets with forecasting, Excel export, and a secure token-based API. That API lets an iPhone Shortcut or a personal **AI assistant** log and read expenses without opening the app.

**Stack:** vanilla JavaScript (ES modules, no build step) · HTML/CSS · Supabase (Postgres, Row Level Security, RPC functions) · Service Worker / PWA · GitHub Pages · SheetJS

## Features

- **Log**: amount, category, date (pre-filled) and an optional description
- **Expenses**: the month's entries grouped by day, with edit and delete
- **Summary**: totals by category and month-over-month comparison, with drill-down into each category
- **Budget**: monthly per-category budgets with colour-coded tracking and an end-of-month forecast
- **Settings**: drag-and-drop category ordering, Excel export, JSON backup and restore, and device token management
- **Installable PWA**: add it to the home screen, and the app shell loads from cache

## Engineering highlights

- **Money stored as integer cents.** Floating point is unsuitable for money (0.1 + 0.2 ≠ 0.3).
- **Security through Row Level Security.** The browser only holds the publishable key. Every row is bound to its owner by Postgres RLS policies, and public sign-up is disabled. Verified: anonymous reads return nothing, anonymous writes are rejected (`42501`) and `/auth/v1/signup` returns `signup_disabled`.
- **Token-based API for automation and AI agents.** iPhone Shortcuts and an AI assistant call `security definer` Postgres functions with a device token:
  - Only the token's **SHA-256 hash** is stored. The token is generated in the browser and shown once.
  - Tokens are **least-privilege**: by default they can only add expenses. Read access (`expense_overview`, `list_expenses`) is a separate opt-in flag.
  - `undo_expense` lets the assistant reverse only entries made **by the same token within the past week**.
  - Deleting a token revokes access immediately.
- **A single data layer.** All Supabase calls live in `js/db.js`, so features such as an offline queue can be added without touching the UI.
- **Honest forecasting.** The month-end forecast is hidden for the first five days, so one large early payment such as rent doesn't distort it. Expenses dated in the future are added as-is rather than extrapolated.
- **Budget model.** A base budget (`year_month = null`) applies to every month, and per-month override rows replace it for a single month. Categories without a budget are shown separately so budget-vs-actual stays accurate.
- **Touch-friendly drag and drop** with Pointer Events. `touch-action: none` applies only to the handle, and listeners sit at `window` level so pointer capture survives DOM reordering. Only changed `sort_order` rows are saved, with an optimistic update and rollback if saving fails.
- **Analysis-ready Excel export** (SheetJS, lazy-loaded): transactions, a month × category summary with budget variance, and monthly totals as real numbers and dates.

## Project structure

```
kulujenseuranta/
├── index.html              app markup
├── styles.css              dark theme, mobile first
├── manifest.webmanifest    PWA manifest
├── sw.js                   service worker (app-shell caching)
├── supabase-schema.sql     tables, RLS policies and token API functions (idempotent)
├── PIKAKOMENTO.md          iPhone Shortcut guide (Finnish)
├── icons/                  app icons
└── js/
    ├── config.js           Supabase URL + publishable key, app version
    ├── app.js              startup and view routing
    ├── db.js               data layer (all Supabase calls)
    ├── state.js            in-memory state + monthly calculations
    ├── format.js           Finnish currency and date formatting
    ├── export.js           Excel export + JSON backup
    └── ui-*.js             views: auth, entry, transactions, summary, budget, categories, tokens
```

## Running locally

The app uses ES modules, so it must be served over HTTP rather than opened as a `file://`:

```bash
python -m http.server 8000
```

Then open `http://localhost:8000`.

To set up your own instance: create a Supabase project, run `supabase-schema.sql` in the SQL editor and put your project URL and publishable key in `js/config.js`. Full step-by-step instructions are in [README.fi.md](README.fi.md).

## Deployment

The app is hosted on GitHub Pages from the root of `main`. To force clients to pick up a new version straight away, bump `APP_VERSION` in `js/config.js` and `VERSION` in `sw.js`.

## Limitations (v1) and roadmap

- Logging requires a network connection. **Planned:** an offline queue in IndexedDB.
- Expenses only (no income), a single currency (EUR) and no budget rollover. **Planned:** rollover, recurring expenses and income.
