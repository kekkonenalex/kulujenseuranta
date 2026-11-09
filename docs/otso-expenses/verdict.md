# Council verdict: the first build of Otso - Expenses

Five advisors (Executor, Contrarian, Outsider, Expansionist, First Principles) answered on their own, then
reviewed each other without knowing who wrote what. This is the chairman's synthesis. Where they disagreed
about facts, the claims were checked against the code (kulujenseuranta and Otso's `otso/` package).

One correction to the brief: `ideas.md` has **88** ids, not 93. All 88 are decided below.

**Bottom line.** Build 1 is a review-and-outlook app with Otso's desk in it, not a logging app with a chat
tab. 31 ideas in four slices, EUR 0 and zero new model tokens, one new pipe (rows Otso writes into
Supabase), income in its own table. Then two weeks of normal use before build 2 is chosen.
**31 APPROVED, 29 LATER, 28 DENIED.** Three of Alex's own choices are reversed for build 1 and need their yes.

## Where the council agrees

- **What the app is for.** Alex logs through Apple Pay (Otso logs most taps) and the iPhone Shortcut, and
  opens the app to review. All five shaped build 1 around three jobs: the ledger is true, Otso's writes are
  visible and reversible, and the month looks forward, with income in it.
- **Truth before insight.** F1, F2, F5, F6, F7 and F10 are unanimous; F3 and F9 have four votes each. A 1 a.m.
  purchase that lands in last month spoils every insight built on top of it.
- **Otso's work, visible.** O4 source badges are unanimous and need no SQL: `device_token_id` is stored but
  never selected (`js/db.js:217`, checked). O6 Undo has four votes.
- **Flags from code, not a model.** O3 is unanimous, N6 has four votes.
- **Income in its own table.** I1 and I2 are unanimous. Separate from `transactions`, so `log_expense`,
  `expense_overview`, `list_expenses` and every Otso check still mean spending.
- **A forecast from history.** N2 and N8 are unanimous, computed in the browser. The RPC's `forecast_cents`
  stays as Otso reads it.
- **O8 explain a number** is unanimous: a sort over entries already loaded.
- **The shell.** D1, D4, D5, D10 and L1 are unanimous, and so is an English UI.
- **One pipe for Otso.** Otso reaches the app as rows it writes into Supabase through a token RPC. Not a
  Tailscale endpoint (dead with the VPN off, and Otso's server refuses cross-origin calls by design), not an
  Edge Function (a second key holder spending outside Otso's budget guard).
- **No new model spend in build 1.**
- **No "Ask Otso" box in build 1.** All five defer or deny O2.
- **Unanimous denials:** O11, O12, X1, X4, X5, X6, X7, L13, L16, I6, I10, N4, N7, N13, D7, D11.

## Where the council clashes

1. **O1, Otso's read card.** Executor and Expansionist: a daily card. Contrarian and Outsider: only when a
   code-computed fact crosses a threshold, blank on normal days. First Principles: defer it and use O7.
   *Resolution:* approved in the threshold form. Code decides and code words it, no model, and no card is a
   valid day. A daily card that restates the screen becomes wallpaper, which is how the evening notes got muted.
2. **The Otso tab.** Executor, Expansionist and First Principles keep it. Contrarian and Outsider drop it (an
   empty room, and a tab named after an assistant promises a chat). *Resolution:* keep it as Otso's desk: what
   Otso logged this week with Undo, flags waiting for a tap, the read card, the monthly letters. That is where
   Alex's "Otso inside the app" lives. But the app opens on Month (see Reversals).
3. **N1, pace nudge.** Executor and Expansionist approve; the other three call it a duplicate. *Checked:*
   `otso/checks/budget_pace.py` already sends exactly this to Telegram, from the 8th to the 25th, at most once
   a week, never the same category twice a month, when a category is projected at least 25% over with half
   already spent. *Resolution:* denied as a new sender; the same finding shows on the O1 card.
4. **I3, runway.** Expansionist and First Principles fight for it. The other three call it an invented date,
   and all five deny I6 (balances), so a runway has no starting point. *Resolution:* LATER.
5. **O5, a tap inbox in the app.** The Expansionist's top pick. The rest see two places answering the same
   tap, which is the double-log path, while tap state lives in Otso's SQLite. *Resolution:* LATER, and only
   as a design with one source of truth.
6. **O6, Undo for Otso's logs.** The Contrarian says the badge plus the existing delete is enough.
   *Resolution:* approved. It is the same delete, put where Otso's entries are, and it is safe: Otso's evening
   review only acts on taps still asked, held or silent (`otso/wallet.py:718-721`, checked), so a deleted
   Otso entry is not logged again.
7. **F3, the `code` field.** The Executor defers it. *Resolution:* approved. The anchor requires a stable code
   before any server message is translated.
8. **Recurring money.** The Outsider approves L5 and I7; First Principles and the Expansionist approve I7.
   *Resolution:* I7 approved as known income dates; L5 later. Income can't double an Apple Pay tap; an
   auto-logged expense can.
9. **Size.** The Expansionist approved 41 ids, and four of the five reviews named that as the bloat the brief
   warns about. *Resolution:* 31, a third of them small fixes, and a usage gate before anything more.

## Blind spots the council caught

From the peer reviews, plus the chairman's checks.

1. **There is no staging database.** Every SQL paste changes the live project that v1.7, the Shortcut and
   Otso are using at that moment; a branch protects only the frontend. Fix: a contract test for every RPC the
   Shortcut and Otso call, run before and right after each paste, a rollback section next to each SQL section,
   and SQL that only adds (new tables, new columns, new keys, new parameters with defaults).
2. **Who may write notes.** Device tokens carry only `can_read`. A token-checked write RPC would let any token,
   the Shortcut's included, post notes into the app. Add a note flag on `device_tokens`, set only on Otso's token.
3. **Otso's text is untrusted.** Notes and letters carry merchant names and email-receipt text, and the app
   renders through `innerHTML` in a page whose stored session can read and write everything. Render Otso's
   text as text, escaped, never as markup.
4. **Dry-run before anything shows.** The flags (O3, N6), the read card (O1) and the forecast (N2, N8) run
   read-only on Alex's real history first, and someone looks at what they would have said. That is the direct
   guard against the muted-notes failure every advisor cited, and it is Alex's own rule.
5. **The rename can break the app.** If the GitHub Pages path changes, the installed PWA, the service-worker
   scope and Otso's `app_url` links all break. Rename the display name, icon and manifest; keep the path.
6. **Finnish category names in an English UI.** The new UI would still say "Ruoka", and renaming a category
   breaks the per-category Shortcuts that hard-code it (Open question 1).
7. **Income needs a writer.** Alex rarely opens the app, so income typed by hand goes stale and Net lies.
   Known paydays (I7) counted on their date fix that without typing. (Chairman.)
8. **An in-app delete teaches Otso nothing.** Telegram's Undo sends the tap back to a fresh question; deleting
   in the app only removes the row. Fine for build 1; a learning undo needs a way back to Otso. (Chairman.)
9. **Web Push exists.** Home-screen web apps on iOS 16.4 and later can receive Web Push, free with VAPID keys
   sent from Otso's VM, no VPN in the path. It is the only way the app itself could warn before an overspend.
   Not in build 1: it is a new channel, and it must replace a Telegram message, not double it (Open question 4).
   Otso has no Web Push code today (checked).
10. **"Asking Otso" was Alex's choice.** All five advisors put O2 in LATER or DENY without flagging that.
    It is now listed as a reversal.
11. **Nobody sized the build against Alex's time.** Alex's own part of build 1: pick a look, paste about four
    SQL sections (a few minutes each), allow Otso's token to post notes, and two weeks of normal use. The rest
    is build work.

## The recommendation

Build a review-and-outlook app with Otso's desk in it.

- **Screens.** Month (summary, budget, income; the screen the app opens on), Expenses (the list, Find,
  source badges, flags), Otso (the desk). A + button opens the one-screen log. Settings sit behind an icon,
  split in four.
- **How Otso gets in.** One table, `otso_notes`, written by Otso's token through one RPC (`post_otso_note`)
  that requires the new note flag. Otso's daily check writes or clears the read card; `expenses_month` also
  saves its monthly letter there. No Tailscale endpoint, no Edge Function, no CORS change, and it works with
  the VPN off.
- **Money.** Income in its own table, never rows in `transactions`. Known paydays count on their date. Net
  and savings rate on Month. A forecast from history from day 1.
- **Cost.** EUR 0 and zero new model tokens: O1 is worded by code, and O7 reuses the review Otso already
  pays for.
- **Contracts.** SQL only adds. Server messages stay Finnish in build 1; the `code` field comes first and
  Otso switches to matching it, so translating later breaks nothing.
- **Order.** The four slices below, each on its own branch, each merged only after the contract test passes
  and, for anything Otso writes or flags, after a dry-run on real data has been looked at.
- **Then a gate.** Two weeks of normal use. Build 2 is chosen from what Alex actually opened and from their
  answers to the reversals. "Ask Otso" through the notes pipe is the first candidate.

## The one thing to do first

**Write the RPC contract test, then ship SQL section 1 (F1, F2, F3, F10) behind it.**

The test calls every RPC the Shortcut and Otso use and checks the RPC names, the `p_*` arguments, the response
keys, the ` (kuvaus)` marker and the two Finnish substrings Otso matches. Its write half is one 0,01 € log and
its immediate undo, with a dedicated test token. Run it green against the live project today, write section 1
with its rollback beside it, Alex pastes it, run the test again.

F1's fix (`(now() at time zone 'Europe/Helsinki')::date`) is right whatever time zone the database runs in, so
the unverified UTC assumption doesn't block it. This step needs no look, changes nothing on screen, and every
later slice stands on it.

## Every idea, decided

### APPROVED (first build): 31

**Slice 1: Foundations** (can start now; needs no look)

| Id | Idea, and why |
|---|---|
| F1 | Helsinki "today" in the database: entries logged between 00:00 and 03:00 land on the wrong day, on the 1st in the wrong month, and every insight rests on dates. |
| F2 | `list_expenses` handles ` (kuvaus)` and returns `id` and `source`: today Otso finds nothing in description-asking categories, and the `id` switches on Otso's dead double-claim guard. |
| F3 | A stable `code` field in RPC answers: the anchor's precondition for ever translating server text; Otso matches the code, the Finnish text stays for now. |
| F4 | Undo for chat-logged expenses: a few lines in Otso to keep the `id` the server already returns, so every Otso log is undoable, not only Apple Pay ones. |
| F5 | Future months visible: a future-dated entry is invisible today; a small navigation fix. |
| F6 | Pin supabase-js and SheetJS with SRI, add a CSP: the main client risk, since a bad CDN publish would get full read and write. |
| F7 | Token docs tell the truth, plus rename and read toggle: the UI understates what tokens can do, and the same update policy carries the new note flag. |
| F9 | Server-side checks on colour format and description length: closes a small CSS-injection hole with one check each. |
| F10 | Truncation flag at the 500 cap: Otso asks for 1000 and silently gets 500; one extra key fixes it. |

**Slice 2: The shell** (in the look Alex picks)

| Id | Idea, and why |
|---|---|
| D1 | New name and identity: Alex's choice; display name, icon and manifest change, the Pages path stays so the installed app and Otso's links keep working. |
| D2 | English UI: Alex's choice; strings gathered in one plain module since every string is rewritten anyway, but no language switcher and no Finnish copy kept up. |
| D3 | Fewer tabs: Month, Expenses and Otso, a + button for logging, settings behind an icon; opens on Month because Alex opens the app to review (see Reversals). |
| D4 | Real icons drawn for the app: Unicode glyphs render differently per platform, and Lucide is banned. |
| D5 | Accessibility pass: primary and delete buttons fail AA contrast today, and sheets have no focus trap. |
| D10 | Settings split into Categories, Budgets, Connections and Data: today one long scroll mixes daily and rare things. |
| L1 | One-screen log: chips instead of the iOS select wheel take a first entry from 5-6 taps to 2 plus the digits. |
| L14 | Search and filter in Expenses, with a total: the data is already in memory; "coffee in October" answered by code, the honest first half of Ask Otso. |

**Slice 3: Otso inside**

| Id | Idea, and why |
|---|---|
| O4 | Source badges (you, Shortcut, Otso): shows what Otso did; no SQL, the column is already stored. |
| O6 | Undo for Otso's logs in the app: a "logged by Otso" list with delete and an undo toast; safe, the evening review won't log it again. |
| O3 | Flags on entries: code-only doubles (same amount, same day, two sources) with a one-tap fix; this is how automated logging actually fails. Dry-run first. |
| N6 | Anomaly flag: an entry over 3x the category's usual size, shown as an O3 flag; the threshold is picked from a dry-run on real history. |
| O1 | Otso's read: a card on Month only when a code-computed fact crosses a threshold (budget_pace's finding, a big gap against the usual); blank on normal days, no model. |
| O7 | Monthly letter: the review `expenses_month` already writes on the 1st, also saved as a note and kept as an archive; no new tokens, and it is Alex's "summaries". |
| N15 | Quiet hours for money notes: one rule for every writer, at most one money note a day, none in quiet hours, in-app cards never push. |

**Slice 4: Money**

| Id | Idea, and why |
|---|---|
| I1 | Income entries: their own table, so no spending total, RPC, Shortcut or Otso check changes meaning. |
| I7 | Paydays calendar: known income (grant, salary) with amount and day, counted on its date so Net stays right without Alex typing it. |
| I2 | Net per month: income minus spending, the headline number on Month. |
| I8 | Savings rate: the monthly number only; the 12-month line waits for charts (D6). |
| N2 | Usual-by-now: "you usually spend 140 € on food by the 10th; you're at 190", from history, in the browser. |
| N8 | Month-end forecast from day 1: the same history curve, fixing the blank first days; the RPC's `forecast_cents` stays as Otso reads it. |
| O8 | Otso explains a number: tap a total, see the entries that made it, biggest first; a few lines over data already loaded. |

### LATER: 29

| Id | Idea, and why |
|---|---|
| O2 | Ask Otso box: Alex chose it (see Reversals), but Otso's server refuses cross-origin calls and is VPN-only; build 2 candidate as a question row Otso answers into `otso_notes`. |
| O5 | Otso's inbox tab for taps: tap state lives in Otso's SQLite, and two places answering one tap means double logs; only with one source of truth. |
| O9 | Otso's money rules in Settings: a second copy of Otso's memory that drifts; needs a sync design first. |
| O10 | Otso proposes budgets: wait until income and a few months of the new data exist. |
| O13 | Weekly 30-second review: another recurring voice; first prove O1 and O7 aren't ignored. |
| O14 | Learned category rules as a list: the rules live in Otso's SQLite; showing and correcting them needs two-way sync. |
| L3 | Repeat a recent entry: Alex rarely logs in the app, and L1 already makes logging short. |
| L4 | Receipt photo: Otso's share pipeline already reads receipts; an in-app camera only if that proves clumsy. |
| L5 | Recurring expenses: auto-logged rent and subscriptions risk doubling Apple Pay and the Shortcut; dry-run against real history first. |
| L6 | Subscriptions view: nearly free once L5 exists. |
| L7 | Offline queue: a late flush can land after Otso's read-back and double-log; needs a dedupe key first. |
| L8 | Split a purchase: Otso's tap flow already splits; the app can edit the parts meanwhile. |
| L15 | Bulk fix: a rare need; one-by-one edits work until the flags show real volume. |
| I3 | Runway: no real balance behind it (I6 is denied), so the date would be a guess dressed as fact. |
| I4 | Savings goals: let income and Net run a while first. |
| I9 | "Can I afford it?": rests on runway and goals, both later. |
| I11 | Link to Otso Markets: the savings rate already works from income minus spending; add broker transfers once Net has a few months. |
| N3 | Category trends: needs months of data and the charts work (D6). |
| N5 | Merchant top list: Apple Pay names and descriptions are inconsistent; Find (L14) answers the question for now. |
| N10 | Budget autopilot: the same idea as O10; do them together, later. |
| N11 | Year in review: needs a year of the new income data first. |
| N12 | Compare with last year's same month: cheap, but belongs with the charts work. |
| N14 | Calendar-aware warnings: guesses from the calendar are how the evening notes got muted; only after O1 earns trust. |
| D6 | Charts over time: worth it together with N3 and I8's 12-month line, after build 1. |
| D8 | Instant open from a cached state: good for a review app; do it once the new screens settle, so the cache shape doesn't change twice. |
| D9 | Aurora micro-motion on save: polish after the chosen look is built. |
| D12 | Tablet and desktop layout: the single column works on the laptop for now. |
| F8 | Fewer full reloads: loading every transaction is fine at today's size; revisit in a year. |
| X8 | Email receipts with the PDF attached: Otso already reads them; storage and attachments are their own project. |

### DENIED: 28

| Id | Idea, and why |
|---|---|
| O11 | Talk to log: opens the microphone, which Alex's rules keep off unless asked; Siri, the Shortcut and Telegram voice already exist. |
| O12 | Avatar moods: decoration with no information, close to the banned list. |
| O15 | "Did you forget?": the most false alarms of any idea; the evening-notes failure again. |
| L2 | Smart default category: a silently wrong guess is worse than a visible choice, and L1's chips are fast. |
| L9 | IOUs shared with someone: a different product, already skipped once for Otso. |
| L10 | Quick tags: no logging path (Apple Pay, Shortcut) fills them; descriptions plus Find cover slicing. |
| L11 | Shortcut 2.0: risks the Shortcut contract to save one tap; the Shortcut works. |
| L12 | Lock Screen quick log: the same contract risk; Back Tap and Control Center already open the Shortcut. |
| L13 | Edit history: one user; O4's badges show who logged an entry, which is the part that matters. |
| L16 | Card-statement CSV import: bank import is out by Alex's choice, and Otso already has a bank-export check. |
| I5 | Pay yourself first: a payday nudge to move money needs accounts and transfers the app won't have. |
| I6 | Accounts lite: hand-kept balances go stale and quietly make every forecast lie. |
| I10 | Round-up jar: virtual money that moves nothing. |
| I12 | Student-life presets: one user, and prefilled amounts go stale; I7 holds the real dates. |
| N1 | Pace nudge: already built, Otso's budget_pace sends exactly this; the app shows the same finding on the O1 card, no second sender. |
| N4 | Weekday heatmap: interesting once, never acted on. |
| N7 | No-spend days counter: gamification by another name. |
| N9 | Price creep: merchant names and portions vary too much for an honest comparison, over small sums. |
| N13 | Cost per use: needs gym visits from the calendar; a fun number, not a decision. |
| D7 | Light mode: true black is the Otso identity. |
| D11 | Teaching empty states for first launch: one user, long since launched; plain empty states come with the redesign anyway. |
| X1 | Otso reads the letter aloud: sound without being asked; never. |
| X2 | Money mood word: a vague label for numbers already on screen. |
| X3 | Bet with Otso: gamification, and the kind of noise Alex mutes. |
| X4 | Envelope mode: a different budgeting model, a rewrite of budgets. |
| X5 | The bear hibernates: decoration. |
| X6 | Money diary PDF: the xlsx export and the monthly letters already keep the record. |
| X7 | Share a read-only month by link: a shareable link into personal finances, in a one-user app. |

## Reversals of Alex's choices (for Alex to confirm)

1. **"Asking Otso" inside the app (O2) waits for build 2.** Alex named it in their answer; all five advisors
   defer or deny it. Why: Otso's web server refuses cross-origin calls on purpose (`otso/ui/web.py:542`, "No
   CORS, ever", and `web_access.py` rejects cross-site `/api` calls, both checked), it is reachable only with
   Tailscale on, and a second chat splits the conversation Telegram already has. Build 1 gives Find with
   totals (L14) instead: code, no model. If Alex confirms, the build-2 path is a mailbox: their question is
   written as a row, Otso picks it up within a minute, answers with its own tools and budget, and writes the
   answer back as a note. No CORS change, and it works with the VPN off.
   *Confirm:* defer to build 2 (recommended), or pull the mailbox version into build 1 (about one more slice).
2. **Otso's live voice stays in Telegram for build 1.** Alex said Telegram isn't the focus, yet pace warnings
   (budget_pace) and Apple Pay tap questions (O5 is LATER) keep arriving there. The app shows the same finding
   on the O1 card when opened, but it can't push. Why: a second sender doubles messages, and a second answerer
   double-logs taps. *Confirm:* keep it in Telegram for now (recommended), or see Open question 4.
3. **The app opens on Month, not on Log.** The north star says logging is the fastest thing on the phone. The
   council's view: the fastest logging already happens outside the app (Apple Pay through Otso with zero taps,
   the Shortcut with about three), and Alex opens the app to review. Logging stays one tap away behind +, and
   the log sheet itself drops from 5-6 taps to 2 plus the digits. *Confirm:* open on Month (recommended), or
   keep opening on Log.

## Open questions for Alex

1. **Category names.** The English UI will show your Finnish category names ("Ruoka"), and renaming one breaks
   the per-category Shortcut that hard-codes it. *Default:* keep the names as they are in build 1; rename later,
   one at a time, updating that Shortcut the same day.
2. **Name versus address.** *Default:* rename what you see (title, icon, manifest name) but keep the GitHub
   repo name and Pages path, so the installed app, its service worker and Otso's "fix it in the app" links keep
   working.
3. **Testing the SQL.** *Default:* no second Supabase project (it would pause after a week unused and may not
   fit the free-tier project limit). Instead, the contract test before and after each paste, with a rollback
   section ready. Say if you'd rather have a staging project.
4. **Web Push.** *Default:* not in build 1; money warnings stay in Telegram. After the two-week gate, if you
   want the app itself to warn before an overspend, Web Push from Otso's VM replaces the Telegram money
   messages rather than adding to them.
