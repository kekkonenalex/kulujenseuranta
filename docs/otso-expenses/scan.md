# kulujenseuranta: deep scan (2026-11-09)

Read-only scan of the app as of commit `b21f90d` (v1.7.0), plus how Otso (jarvis repo) uses it.
Citations are `file:line`. Paths under `js/` are this repo; `otso/...` paths are the jarvis repo.
No code was changed. Nothing here is a secret: the project URL and publishable key are referred
to, not repeated.

---

## 1. What the app does today, screen by screen

Boot (`index.html:21-24`) -> config-missing screen if `js/config.js` is empty (`index.html:27-36`,
`js/db.js:22-26`) -> sign-in screen (`index.html:39-65`) -> the app. The app always opens on
**Kirjaa** (`js/app.js:115`). A sticky top bar shows the view title and an offline badge
(`index.html:70-73`); a fixed 5-tab bar sits at the bottom (`index.html:263-279`). The selected
month is shared by Kulut, Yhteenveto and Budjetti (`js/state.js:14`); "next month" is disabled at
the current month (`js/app.js:66-67`).

### Kirjaa (log an expense) - `index.html:78-119`, `js/ui-entry.js`
- Fields: big centred amount input (`inputmode=decimal`, 92 px tall, `styles.css:185-189`),
  category `<select>` with a colour dot for the chosen category (`js/ui-entry.js:19-23`),
  "Hallitse" link to Asetukset, date chips Tänään / Eilen + native date input, optional
  description (max 120), "Tallenna kulu".
- Amount accepts `12,50`, `12.50`, spaces, `€` (`js/format.js:35-45`); input is filtered to
  digits, `,` and `.` (`js/ui-entry.js:123-126`).
- After save: amount and description cleared, **category kept**, date reset to today, toast
  "Kirjattu X €", focus back to amount (`js/ui-entry.js:97-101`).
- Tap count, first entry after launch: home icon (1) -> tap amount (1; no autofocus at boot,
  focus only happens after a save, `js/ui-entry.js:101`) -> digits -> open select (1) -> pick (1)
  (+1 "Done" on the iOS wheel) -> Tallenna (1) = **5-6 taps** + digits. Next entry in the same
  category: digits + Tallenna = **1 tap**. Yesterday +1; another date +2-3; description +1 + typing.
  The README promises "kolmella kosketuksella" (`README.md:4`): only true for repeat entries.
- iPhone Shortcut path (no app): Control Center/Back Tap (1) -> number pad -> Done (1) -> category
  list (1) -> optional description -> notification = **~3 taps** (`PIKAKOMENTO.md:43-102`).

### Kulut (transactions) - `index.html:122-134`, `js/ui-transactions.js`
- Month nav, month total card, list grouped by day with a day heading and day total
  (`js/ui-transactions.js:27-65`), each row: colour dot, category, description, amount.
- Tap a row -> bottom sheet editor (amount, category incl. archived, date, description) with
  Tallenna / Peruuta / "Poista kirjaus" (`js/ui-transactions.js:74-152`).
- Edit: tab (1) + row (1) + change + Tallenna (1). Delete: tab + row + Poista + confirm = 4 taps.
  No undo after delete ("tätä ei voi peruuttaa", `js/ui-transactions.js:140`). No search, no filter,
  no indicator of whether an entry came from the app, the Shortcut or Otso.

### Yhteenveto (summary) - `index.html:137-153`, `js/ui-summary.js`
- Hero: month total, comparison with the previous month in Finnish inessive grammar
  (`js/ui-summary.js:13-26`, `js/format.js:102-104`), entry count.
- One card per category, sorted by amount, bar width relative to the largest category, share % and
  count (`js/ui-summary.js:28-60`).
- Tap a category -> read-only sheet of that month's entries in it (`js/ui-summary.js:79-111`);
  entries can't be edited from there.

### Budjetti (budget) - `index.html:156-186`, `js/ui-budget.js`
- Hero: spent in budgeted categories vs sum of category budgets, bar, "Jäljellä"/"Yli",
  forecast (from day 5 of the current month, `js/state.js:171-209`), and a line for spend in
  categories without a budget (`js/ui-budget.js:29-83`).
- Budgeted rows sorted by share desc, green < 80 % <= yellow <= 100 % < red
  (`js/state.js:134-164`, `styles.css:316-322`); "vain tämä kuukausi" tag on overrides.
- "Ei budjettia" section with "Aseta" per category (`js/ui-budget.js:110-137`).
- Tap a row -> sheet: amount, scope radio "Joka kuukausi" (base budget, `year_month null`) or
  "Vain <month>" (override), Tallenna, Poista budjetti (`js/ui-budget.js:147-254`).
- Set a budget: tab + row + amount + (scope) + Tallenna = 4-5 taps.

### Asetukset (settings) - `index.html:189-259`, one long scroll of cards
1. **Kategoriat**: list with drag handle (pointer events, handle only, `js/ui-categories.js:191-308`),
   edit (name, colour, archived, "Kysy kuvaus pikakomennossa") and delete (offers archive when the
   category has entries, `js/ui-categories.js:141-180`); add form: name + colour + Lisää.
2. **Vienti**: .xlsx with three sheets (Transaktiot, Kuukausiyhteenveto, Kuukausisummat), SheetJS
   lazy-loaded (`js/export.js:18-39,160-184`).
3. **Varmuuskopio**: JSON export / import (merge by category name, never deletes, importing twice
   duplicates entries; `js/db.js:349-423`, `js/export.js:190-263`).
4. **Pikakomento (iPhone)**: device tokens list (name, "lukuoikeus", created, last used), create
   (name + "Saa myös lukea" checkbox + Luo -> token shown once with copy button), delete
   (`js/ui-tokens.js`).
5. **Tunnus**: signed-in email, Kirjaudu ulos, version string.

---

## 2. Architecture

No build step, plain ES modules (`index.html:290`), supabase-js UMD from jsDelivr
(`index.html:289`), hosted on GitHub Pages from `main` root (`README.md:64`).

### Module map
| File | Purpose | LOC |
|---|---|---|
| `index.html` | All markup: boot, config, auth, 5 panels, tab bar, modal, toast | 292 |
| `styles.css` | Dark theme tokens and every component | 479 |
| `sw.js` | Shell cache, stale-while-revalidate | 101 |
| `manifest.webmanifest` | PWA manifest (fi, standalone, portrait) | 43 |
| `js/config.js` | Supabase URL + publishable key + `APP_VERSION` | 18 |
| `js/app.js` | Boot, screens, tab/month routing, data load, sign-out, SW registration | 240 |
| `js/db.js` | The only Supabase caller; error translation to Finnish | 423 |
| `js/state.js` | Global state object, pub/sub, derived summaries, budgets, forecast | 279 |
| `js/format.js` | fi-FI money/date formatting, amount parsing, ISO date helpers | 126 |
| `js/ui-common.js` | `qs`, show/hide, toast, modal, confirm, download | 132 |
| `js/ui-auth.js` | Sign in / sign up form | 88 |
| `js/ui-entry.js` | Kirjaa | 138 |
| `js/ui-transactions.js` | Kulut + edit sheet | 163 |
| `js/ui-summary.js` | Yhteenveto + category sheet | 118 |
| `js/ui-budget.js` | Budjetti + budget sheet | 261 |
| `js/ui-categories.js` | Category CRUD + drag reorder | 324 |
| `js/ui-tokens.js` | Device tokens | 156 |
| `js/export.js` | xlsx export, JSON backup/import | 280 |
| `supabase-schema.sql` | Tables, RLS, triggers, all RPCs (idempotent) | 782 |

### State model
- One mutable object `state` = `{user, categories, transactions, budgets, deviceTokens, month,
  view, online}` (`js/state.js:8-17`); `setState` = `Object.assign` + notify all listeners
  (`js/state.js:32-35`). The only listener is `renderAll`, which re-renders **all six views** on
  every change, via `innerHTML` (`js/app.js:74-83,206`).
- Load: all categories, **all transactions ever** (paged 1000 at a time), all budgets, all tokens
  (`js/app.js:89-98`, `js/db.js:211-227`). Reloaded when the app returns to the foreground after
  60 s (`js/app.js:31,179-183`). No realtime: Shortcut/Otso entries appear on the next reload.
- All aggregation (month totals, summaries, budgets, forecast) is client-side (`js/state.js:96-274`).
- Writes are await-then-patch (not optimistic), except reorder which is optimistic with rollback
  (`js/ui-categories.js:284-308`).

### Data model (`supabase-schema.sql`)
- **categories** (12-34): `id uuid pk`, `user_id -> auth.users cascade`, `name text not blank`,
  `color text default '#6366f1'` (no format check), `sort_order int`, `archived bool`,
  `created_at`, `ask_description bool` (v1.7). Unique `(user_id, lower(btrim(name)))`.
- **transactions** (39-55, 617-618): `id`, `user_id`, `category_id -> categories ON DELETE RESTRICT`,
  `amount_cents int > 0`, `occurred_on date default current_date`, `description text` (no length
  limit server-side), `created_at`, `updated_at` (trigger), `device_token_id -> device_tokens
  ON DELETE SET NULL` (KUMOAMINEN part). Indexes on `(user_id, occurred_on desc)` and
  `(user_id, category_id)`.
- **budgets** (65-89): `id`, `user_id`, `category_id -> categories cascade`, `year_month text`
  (`null` = base budget every month, `'YYYY-MM'` = override; regex-checked), `amount_cents >= 0`,
  timestamps. Partial unique indexes: one base per category, one override per category-month.
  No total budget is stored: it is the sum of category budgets.
- **device_tokens** (207-216, 417): `id`, `user_id`, `name default 'iPhone'`, `token_hash text unique`
  (SHA-256 hex; the raw token is generated in the browser, shown once, `js/ui-tokens.js:21-34`),
  `created_at`, `last_used_at`, `can_read bool default false`.
- Triggers: `set_updated_at` on transactions/budgets (94-112); `check_category_owner`
  (security definer) rejects a transaction/budget whose category belongs to another user (117-142).
- **RLS** (149-193, 218-229): every table `auth.uid() = user_id` for select/insert/update/delete;
  device_tokens has select/insert/delete only (no update: a token can't be renamed or have
  `can_read` toggled).

### RPCs (all `security definer`, `search_path = public, extensions`)
| Function | Granted to | Token needed | Permits |
|---|---|---|---|
| `fmt_eur(int)` (239-245) | anon, authenticated | - | Formats `12,50 €` |
| `log_expense(p_token, p_amount numeric, p_category, p_description=null, p_occurred_on=null)` (620-738, supersedes 247-365) | anon, authenticated | any | Insert one transaction for the token's user, category matched case-insensitively among non-archived, strips a trailing `(kuvaus)`; amount 0 < x <= 1 000 000 €; date defaults to **DB `current_date`**; stamps `device_token_id`; returns `{ok, id, message, category, amount_cents, occurred_on, month_spent_cents, budget_cents, remaining_cents}` with a ready Finnish `message` |
| `list_expense_categories(p_token)` (367-400) | anon, authenticated | any | `{ok, categories: [name or "name (kuvaus)"], message}` ordered by sort_order |
| `token_reader(p_token)` (421-443) | revoked from public/anon/authenticated | can_read | Internal: returns user id, bumps `last_used_at` |
| `expense_overview(p_token, p_month=null)` (449-550) | anon, authenticated | can_read | Month per category: `{category, spent_cents, count, budget_cents, previous_cents}`, plus `month, total_cents, previous_total_cents, budget_total_cents, forecast_cents` |
| `list_expenses(p_token, p_from, p_to, p_category=null, p_limit=200)` (553-598) | anon, authenticated | can_read | `{expenses: [{occurred_on, category, amount_cents, description}]}`; range <= 400 days, limit clamped to 1..**500**; no `id` |
| `undo_expense(p_token, p_id uuid)` (741-775) | anon, authenticated | any | Delete one transaction **logged by that same token**, created < 7 days ago |
| `check_category_owner()` (117-132) | trigger | - | Integrity only |

### Service worker (`sw.js`)
- Cache `kulut-shell-v1.7.0`; precaches 23 shell files individually so one miss doesn't fail
  install (`sw.js:12-52`); `skipWaiting` + `clients.claim` (50, 58); deletes other caches.
- Fetch: GETs only; same-origin and `cdn.jsdelivr.net` are **stale-while-revalidate**; Supabase
  and everything else go straight to network (62-101). Navigation falls back to cached index.html;
  otherwise a Finnish 503 text.
- Version must be bumped by hand in two places (`sw.js:9`, `js/config.js:18`); a deploy shows on the
  second launch (`README.md:81-83`).

### Auth
- Supabase email + password, session persisted in localStorage, auto refresh
  (`js/db.js:36-42,114-146`). Sign-ups are disabled in the Supabase project (`README.md:69-73`),
  but the sign-up toggle is still in the UI (`index.html:61-63`, `js/ui-auth.js:13-26`).
- The Shortcut and Otso never sign in: they hold a long-lived device token and call the RPCs with
  the publishable key as `apikey` (`supabase-schema.sql:196-205`).

---

## 3. Visual design today

- **Theme:** dark only (`index.html:9`, `<meta name=color-scheme content=dark>`), no light mode.
- **Palette** (`styles.css:6-23`): `--bg #0f1115`, `--bg-2 #171a21` (cards, tab bar), `--bg-3 #1f232c`
  (inputs, secondary buttons), `--line #2b303b`, `--text #e8eaf0`, `--text-dim #9aa3b2`,
  `--accent #6366f1` (Tailwind indigo-500), `--accent-2 #818cf8` (indigo-400, links/active tab),
  `--danger #ef4444`, `--warn #f59e0b`, `--ok #22c55e`. Off-token: focus bg `#232833` (91),
  selected `#232840` (231), alert text `#fecaca` / `#c7d2fe` (137-138), badge `#fcd34d` (143),
  toast `#bbf7d0` (470), deleted-category grey `#6b7280` (`js/state.js:115`).
- **Category colours**: user-picked via native `<input type=color>`; new ones get a random pick from
  10 Tailwind-500 hexes `#6366f1 #0ea5e9 #10b981 #f59e0b #ef4444 #ec4899 #8b5cf6 #14b8a6 #f97316
  #84cc16` (`js/ui-categories.js:69-73`). Shown as 12-14 px dots and as summary bar fills.
- **Type:** system stack only (`-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, ...`,
  `styles.css:22`), 16 px base, 1.45 line height. Big numbers: amount input 2.6rem/700, summary
  hero 2.1rem/800, budget hero 2rem/800, tight letter-spacing; `tabular-nums` on amounts only in lists.
  Tab labels 0.64rem (~10 px), section labels 0.82rem dim.
- **Layout:** mobile-first single column, `max-width 620px` centred (`styles.css:157-161`); sticky
  blurred top bar; fixed 5-column bottom tab bar 62 px + safe area, blurred `rgba(23,26,33,.96)`
  (164-171); safe-area insets respected.
- **Components:** cards (bg-2, 1 px line border, radius 14); buttons min 46 px, radius 11, weight
  600, primary indigo, secondary bg-3, danger-outline; pill chips (Tänään/Eilen) that turn indigo;
  progress bars 7 px / 11 px pill; bottom-sheet modal (radius 18 top, 0.18 s slide-up, 88 dvh max,
  60 % black backdrop); pill toast above the tab bar, 2.6 s; alerts tinted red/indigo; tags.
- **Iconography:** Unicode glyphs, not an icon set: tabs `＋ ☰ ▦ ◎ ⚙` (`index.html:265-277`), edit `✎`,
  delete emoji `🗑`, drag `⠿`, select chevron `⌄`, month `‹ ›`. Rendering varies by platform.
- **App icon** (`icons/icon.svg`): 512 rounded square (rx 112), diagonal gradient `#4f46e5 -> #0ea5e9`,
  three white ascending bars at 55/75/100 % opacity, a white circle top-right with an indigo plus.
  PNGs 180/192/512/512-maskable exist; not checked whether they match the SVG.
- Overall: a competent generic "Tailwind indigo on slate" dark UI; no brand identity of its own,
  and unrelated to Otso's look.

---

## 4. The Otso integration today (jarvis), end to end

**Wiring.** `config.toml:558-577` `[expenses]`: `enabled`, `url`, `api_key` (the publishable key),
`receipts_from_email`, `apple_pay`, `app_url` (the Pages URL, used in "fix it in the app" links).
The device token is `KULUT_TOKEN` in Otso's `.env` (`otso/providers/expenses.py:30,73`). It was
made in Asetukset with **"Saa myös lukea" ticked** (`can_read = true`), so it can: log, list
categories, read overview/list, and undo entries it logged itself within 7 days. It cannot edit,
delete other entries, or touch budgets/categories. `services["expenses"]` is built in
`otso/home.py:267`.

**The seam:** `otso/providers/expenses.py` (only module that talks to the tracker).
- `POST {url}/rest/v1/rpc/{fn}` with headers `apikey`, `Content-Type: application/json`, body
  `{"p_token": ..., ...}` (lines 133-179). Timeout 10 s; reads retried once, `log_expense` and
  `undo_expense` never retried (112, 118, 146).
- RPCs used: `list_expense_categories` (cached 600 s, 85-90), `log_expense` (108-112, sends
  `p_amount` as float, `p_occurred_on` ISO or null), `undo_expense` (114-122), `expense_overview`
  (124-125), `list_expenses` (127-129).
- Errors: 404 -> "run the LUKUOIKEUS/KUMOAMINEN part"; 401/403 -> key; >=500 -> "free project
  paused"; `ok:false` -> raises with the server's `message`. **It string-matches Finnish server
  text**: `"kirjausta ei löydy"` -> `EntryGone` (120) and `"lukuoikeutta"` (168).
- Category matching: exact, then prefix, then substring, casefolded; ambiguity lists all names for
  the model (92-106).

**Model tools** (`otso/tools/expenses.py`): `log_expense` (ungated, immediate, 60-80),
`expense_overview` (96-109), `list_expenses` (112-138), `compare_bank_export` (149-190),
`log_expenses` (batch, `confirm=True`, 219-241), `apple_pay_taps` (248-262), `tap_rule` (297-342),
`settle_tap` (with `split` / `my_share`, 345-370), `clear_tap` (373-390). Read outputs are wrapped
as untrusted. System prompt tells it to log right away (`otso/prompt.py:158-160`).

**Background checks:** `expenses_month` (1st-3rd at 09:00, overview + LLM review,
`otso/checks/expenses_month.py`), `budget_pace` (8th-25th at 18:30, overview + list,
`otso/checks/budget_pace.py:30-50`), `apple_pay` (21:30 evening review, `otso/checks/apple_pay.py`),
roast and texts_first (read 35 days of entries, `otso/checks/roast.py:106`,
`otso/checks/texts_first.py:116`), email receipts -> Allow/Don't card for `log_expense`, skipped
when the same amount already exists that day (`otso/checks/mail.py:568-600`), hourly health ping
via `categories()` (`otso/checks/health.py:50-53`), merchant-rule proposals (`otso/checks/learn.py:132-136`).
Otso also has a GitHub tool pointed at this repo (`config.toml:1002`).

**Apple Pay flow** (`otso/wallet.py`, `otso/ui/web_iphone.py:109-180`):
1. iPhone Shortcuts "Transaction" automation POSTs `{merchant, amount, card}` to Otso's
   `/api/tap` over Tailscale (`otso/ui/web.py:798`). Recorded in Otso's SQLite `wallet_taps`.
2. `arrive()` (`otso/wallet.py:348-383`): blank -> ignored (a blank within 30 s before a real tap is
   a double); no EUR amount -> held; merchant Otso is sure about -> `silent`; else a question
   notice with two guessed category buttons + "Don't log" + "Other" (max 10/day).
3. `silent` -> background thread `log_now` -> `answer()`: reads the tracker back first
   (`list_expenses` day..day+1) so a hand-logged purchase isn't logged twice, then `log_expense`
   with `description = merchant` and `p_occurred_on = paid date`; keeps the returned `id`
   (`otso/wallet.py:430-499,550-556`). Notice "Logged X to Y" with **Undo**.
4. Undo -> `undo_expense(p_id)` -> tap goes back to "asked" with a fresh question
   (`otso/wallet.py:575-623`); allowed within 7 days minus 1 h (312).
5. Evening review (21:30): reads 7-14 days back, settles taps the tracker already accounts for
   (including multi-part receipts, `_parts`), **learns from categories Alex changed in the app**,
   logs remaining `silent` taps, expires week-old open taps, posts a summary with the app link
   (`otso/wallet.py:686-866`).

**Contract fields Otso reads:** `categories` (list of strings incl. ` (kuvaus)`); `log_expense` ->
`message`, `id`; `undo_expense` -> `ok`, `message`; `expense_overview` -> `month, total_cents,
budget_total_cents, previous_total_cents, forecast_cents, categories[].{category, spent_cents,
count, budget_cents, previous_cents}` (`otso/formats.py:63-86`, `otso/money.py`); `list_expenses`
-> `expenses[].{occurred_on, category, amount_cents, description}` and it also tries `id`
(`otso/wallet.py:426`).

---

## 5. Weak spots

### Bugs
1. **UTC "today".** `log_expense` defaults to the DB's `current_date` (`supabase-schema.sql:664`);
   `expense_overview` uses it for the default month and forecast (476, 526-529). Supabase runs UTC
   by default (not verified for this project). The Shortcut never sends a date
   (`PIKAKOMENTO.md:79-85`), nor does Otso's chat `log_expense` without a day
   (`otso/tools/expenses.py:73-76`): anything logged 00:00-02:00/03:00 Helsinki time lands on the
   previous day, at month start in the previous month.
2. **`list_expenses` can't filter a `(kuvaus)` category.** Otso's `categories()` returns
   `"Name (kuvaus)"`, `match()` returns that, and `list_expenses` compares it to the bare name
   (`supabase-schema.sql:591`; `otso/providers/expenses.py:88`; `otso/tools/expenses.py:125`). Result:
   "No expenses then." for every description-asking category. `log_expense` strips the marker,
   `list_expenses` doesn't.
3. **`list_expenses` returns no `id`**, but `otso/wallet.py:424-427` (`_entry_of`) excludes entries
   other taps claimed by `e.get("id")`: always empty, so that guard does nothing.
4. **Silent truncation:** Otso asks `limit=1000` in several places (`otso/wallet.py:240,390,423`,
   `otso/checks/roast.py:106`, `otso/tools/expenses.py:176`); the server clamps to 500
   (`supabase-schema.sql:593`) without saying so.
5. **Future-dated entries are invisible in the UI.** The date input has no max (`index.html:106`) and
   the RPC accepts any date, but month navigation stops at the current month (`js/app.js:66-67,170`).
6. Chat-logged expenses can't be undone although the server would allow it: the tool drops the
   returned `id` (`otso/tools/expenses.py:76-80`) and tells the model it can't be undone (63-64).
   `answer_split` keeps only the first part's id (`otso/wallet.py:535-536`).
7. `confirmModal` never resolves when closed by backdrop or Escape (`js/ui-common.js:104-120` vs
   `closeModal` 86-95): a dangling promise; the edit sheet is already closed before the confirm,
   so cancelling a delete loses the edit sheet (`js/ui-transactions.js:136-142`, `js/ui-budget.js:234-243`).
8. Error toasts vanish after 2.6 s (`js/ui-common.js:60`), too short for the long Finnish messages
   from `js/db.js:55-96`.

### UX friction
- 5-6 taps for a first entry (section 1); the native `<select>` wheel is the slowest step, and the
  kept category after save risks silently wrong categories on the next entry (`js/ui-entry.js:92-93`).
- Opening any sheet focuses the first input, so the keyboard pops over an edit sheet you only wanted
  to look at or delete from (`js/ui-common.js:79-82`).
- No undo for in-app saves/deletes (Otso has Undo; the app doesn't).
- No search, filter, or source badge (app / Shortcut / Otso) in Kulut; `device_token_id` is
  stored but never selected (`js/db.js:217`).
- Summary category sheet is read-only (`js/ui-summary.js:79-111`).
- Asetukset is one long scroll mixing daily (categories) and rare (backup, tokens) things.
- Tokens can't be renamed or have read access toggled (no update policy, `supabase-schema.sql:220-229`).
- Data from Otso/Shortcut appears only after a 60 s-stale foreground reload (`js/app.js:179-183`).
- Dead UI and code: sign-up toggle (signups disabled); unused `.cat-grid`/`.cat-btn`
  (`styles.css:218-231,474-476`), `formatAmount`, `percent`, `formatPercent` (`js/format.js:26,119,124`),
  `defaultEntryDate` (`js/state.js:277`).

### Missing
Offline queue (`README.md:274-275`); income; recurring expenses; budget rollover; search; light
theme; English; charts over time (only one month at a time); a stable machine-readable error code
in RPC responses.

### Security
- **Supply chain is the main client risk.** supabase-js is loaded as floating `@2` with no SRI
  (`index.html:289`), SheetJS without SRI (`js/export.js:18`), and the SW caches jsDelivr responses
  (`sw.js:40,68`). A bad publish would run in the app's origin with the session in localStorage
  (`js/db.js:38`): full read/write of all data. No CSP. SheetJS 0.18.5 has known parsing CVEs; the
  app only writes files, so not exploitable here, but it is unmaintained on npm.
- Doc drift that understates token power: the UI says a token can't read or delete
  (`index.html:231`), as do `PIKAKOMENTO.md:7-8,205-207` and `README.md:227-228`. Since KUMOAMINEN,
  **any** token can delete its own entries for 7 days (`supabase-schema.sql:741-775`), and can_read
  tokens can read everything. Otso's own comments say the same stale thing
  (`otso/actionlog.py:10`, `otso/tools/expenses.py:3`).
- No server-side length limits on `description` or category `name` (`supabase-schema.sql:15,46`);
  clients cap at 120/40. `color` is unvalidated text injected into `style=""` through `escapeHtml`
  (`js/ui-transactions.js:54`), so `;`-style CSS injection is possible from your own data or a crafted
  backup file. Low risk (single user), easy fix: a `check (color ~ '^#[0-9a-f]{6}$')`.
- `token_reader` bumps `last_used_at` on reads (`supabase-schema.sql:438`), so "last used" mixes reads
  and writes. RPCs have no rate limit; 256-bit tokens make guessing infeasible.
- RLS itself looks correct: every table is owner-scoped; ownership of category is enforced by trigger.

### Accessibility
- Contrast: white on `#6366f1` is 4.47:1 (just under AA 4.5) for all primary buttons; white on
  `#ef4444` is 3.76:1 (fails) for "Poista"; input/card borders `#2b303b` on `#1f232c`/`#171a21` are
  about 1.2-1.4:1 (WCAG 1.4.11 wants 3:1 for field boundaries). Dim text `#9aa3b2` passes (6.2-7.4:1).
- Tab bar: no `aria-current`, active state by colour only (`styles.css:181`), ~10 px labels.
- Modal: `role=dialog` but no `aria-labelledby`, no focus trap, focus not restored, background not
  inert (`index.html:283-286`, `js/ui-common.js:67-95`).
- Description, new-category name and token name inputs have no `<label>`, only placeholders
  (`index.html:109-111,200,239`).
- Drag reorder is pointer-only, handle `aria-hidden` (`js/ui-categories.js:24`): no keyboard or
  screen-reader way to reorder.
- Good: 44-46 px touch targets, `prefers-reduced-motion` honoured (`styles.css:477-479`), icon buttons
  have aria-labels, alerts use `role=alert`, `lang="fi"`.

### Finnish-only (for an English UI)
- No i18n layer: strings are inline. Rough count: **~80 text nodes/attributes in `index.html`** and
  **~190 in JS** (`js/export.js` ~41, `js/ui-budget.js` ~31, `js/ui-categories.js` ~23,
  `js/ui-tokens.js` ~16, `js/ui-transactions.js` ~16, `js/db.js` ~14 error translations,
  `js/app.js` ~11, `js/ui-auth.js` ~11, `js/ui-summary.js` ~10), plus `sw.js` (2), the manifest
  (name, description, `lang`), and Excel sheet/column names.
- Locale logic: `fi-FI` Intl formatters (`js/format.js:9-17`), Finnish month inflection
  (`js/format.js:102-104`), Finnish plurals inline (`js/ui-summary.js:32-34,56`), `'fi'` collation
  (`js/state.js:48,56`), date format `d.m.yyyy`.
- **Server side:** ~15 Finnish messages in RPCs (`supabase-schema.sql` 272-313, 380-388, 473-478,
  572-576, 646-685, 716-723, 752-773) and the `(kuvaus)` marker (306, 392, 678). These are part of
  the Shortcut and Otso contract (section 6).

---

## 6. Constraints a redesign must respect

**Platform**
- No build step: static files, ES modules, CDN libraries (`README.md:17`). Pin exact versions and
  add SRI when touching the CDN tags.
- GitHub Pages from `main` root; **pushing main deploys** (`README.md:64,75-83`). Work on a branch.
  The app lives under a sub-path, so keep relative URLs (`./`, manifest `start_url`/`scope` `./`).
- Service worker: bump `VERSION` (`sw.js:9`) and `APP_VERSION` (`js/config.js:18`) together, and
  update the `SHELL` list (`sw.js:12-36`) when files are added or renamed, or the PWA serves stale code.
- Supabase free tier: pauses after a week unused (`PIKAKOMENTO.md:201`), so Otso's hourly health
  ping keeps it awake; 500 MB DB; everything must stay EUR 0. RLS + publishable key is the security
  model; never a service key in the browser (`js/config.js:9-11`).
- Schema changes go into `supabase-schema.sql` as idempotent, separately runnable sections, applied
  by hand in the SQL Editor; existing data (cents integers, `year_month null` semantics,
  `ON DELETE RESTRICT` on categories) must survive.

**iPhone Shortcut contract** (`PIKAKOMENTO.md`) - must not break:
- Endpoints `POST /rest/v1/rpc/list_expense_categories` and `/rest/v1/rpc/log_expense`, header
  `apikey` = the current publishable key (rotating it breaks every Shortcut and Otso's config).
- Argument names `p_token`, `p_amount` (JSON number), `p_category`, optional `p_description`
  (and `p_occurred_on`). Function **signatures must stay the same**: PostgREST resolves by argument
  names, and adding an overload instead of `create or replace` causes "could not choose the best
  candidate function". New params only with defaults, by replacing the function.
- `list_expense_categories` returns `{categories: [string]}` where description-asking categories end
  in the literal ` (kuvaus)`: the Shortcut's If tests "contains `(kuvaus)`" (`PIKAKOMENTO.md:123-126`)
  and `log_expense` strips it. Renaming the marker (e.g. to English) breaks existing Shortcuts.
- `log_expense` returns `message` (shown verbatim as the notification, success and error alike,
  `PIKAKOMENTO.md:91-102`); documented extra fields `ok, category, amount_cents, month_spent_cents,
  budget_cents, remaining_cents` (`PIKAKOMENTO.md:146-151`). The message language can change
  safely for the Shortcut.
- Per-category Shortcuts hard-code category names (`PIKAKOMENTO.md:182-191`): renaming a category
  breaks them (matching is case-insensitive only).

**Otso's RPC contract** (jarvis `otso/providers/expenses.py`, `otso/formats.py`, `otso/money.py`,
`otso/wallet.py`):
- Same five RPCs and argument names, plus `p_month`, `p_from`, `p_to`, `p_category`, `p_limit`, `p_id`.
- Response keys listed in section 4, `ok:false` + `message` for errors, and the `id` from
  `log_expense` (Undo depends on it).
- Finnish substrings Otso matches: `"kirjausta ei löydy"` (undo -> EntryGone) and `"lukuoikeutta"`.
  Translating server messages needs a coordinated Otso change; better to add a stable `code` field
  first and match on that.
- `undo_expense` semantics: only the same token, within 7 days (Otso assumes 7 d - 1 h,
  `otso/wallet.py:312`).
- Otso learns from entries edited in the app (the evening review compares categories), so editing in
  the app must keep `occurred_on`, `amount_cents` and `category` names stable and readable via
  `list_expenses`.
- Safe additive improvements: `id` (and maybe `source`) on `list_expenses` rows, `(kuvaus)` stripping
  in `list_expenses`' category filter, a local-time `current_date`
  (`(now() at time zone 'Europe/Helsinki')::date`), an explicit limit flag when truncated.
