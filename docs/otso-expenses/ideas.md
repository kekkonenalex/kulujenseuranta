# Otso - Expenses: brainstorm (crackhead energy, 9 Nov 2026)

Unfiltered on purpose. One line each. The council picks; see verdict.md.

## O: Otso inside the app

- O1 **Otso's read**: a short card at the top of Summary, written by Otso once a day ("Food is running 20% hot; it's the weekend lunches").
- O2 **Ask Otso** box in the app: "how much did I spend on coffee in October?", answered from the data in code, with the model only when needed.
- O3 **Flags on entries**: Otso marks odd ones in Expenses (a double, an unusual amount, a category that looks wrong) with a one-tap fix.
- O4 **Source badges**: each entry shows where it came from (by hand, Shortcut, Apple Pay via Otso, email receipt), so you know what Otso did.
- O5 **Otso's inbox tab**: Apple Pay taps waiting for a category, answered right in the expense app, not only in Telegram.
- O6 **Undo for Otso's logs inside the app**: a "logged by Otso" strip on today's entries with Undo, the same Undo Telegram has.
- O7 **Monthly letter**: on the 1st, Otso writes last month's story as a page in the app, kept as an archive you can scroll.
- O8 **Otso explains a number**: tap any total, "why is this high?", and get the 3 entries that made it.
- O9 **Otso's memory of your money rules** ("rent is fixed", "Wolt is a treat") shown and editable in Settings.
- O10 **Otso proposes budgets** from three months of history; you accept them per category.
- O11 **Talk to log**: a mic button, "twelve fifty lunch at Chemicum", parsed into amount, category, place and day.
- O12 **Otso avatar states**: the bear mark changes with the month (calm, alert, over budget). Subtle, never cute.
- O13 **Weekly 30-second review** in the app on Sunday evening: 3 cards, swipe through, done.
- O14 **Otso writes the category rules** it learned from Apple Pay into a visible list you can correct.
- O15 **"Did you forget?"**: Otso notices a usual weekly expense is missing (the gym, the bus card) and asks.

## L: Smarter logging

- L1 **One-screen log**: the amount pad and category chips on one screen, no native select. First entry in 2 taps plus the digits.
- L2 **Smart default category**: by time and place (lunch hour means food), not just the last one used.
- L3 **Recent-entries repeat**: one tap logs "the same coffee again".
- L4 **Receipt photo**: Otso reads it (the existing share pipeline), proposes the entry or a split, you confirm.
- L5 **Recurring expenses**: rent, phone, Spotify logged automatically on their day, with a heads-up the day before.
- L6 **Subscriptions view**: everything recurring with its yearly cost ("Spotify is 131 € a year").
- L7 **Offline queue**: logs on the metro saved locally and sent when the network is back.
- L8 **Split a purchase**: one receipt, two categories, or "my share of 40 € is 20".
- L9 **Shared with someone**: Venny owes 7,95, tracked and settled (IOUs, skipped once for Otso; maybe it fits here).
- L10 **Quick tags** beyond categories (#trip-stockholm, #birthday) for slicing later.
- L11 **Home-screen widget / Shortcut 2.0**: amount and category in one Shortcut prompt, using the new RPCs.
- L12 **Lock Screen quick log** via Shortcut with the 3 most-used categories as buttons.
- L13 **Edit history**: see that an entry was changed, by whom (you or Otso).
- L14 **Search and filter** in Expenses: text, category, amount range, source.
- L15 **Bulk fix**: select 5 entries and change their category at once.
- L16 **Card-statement CSV import** from S-Pankki's web bank export (not a bank API), deduped against what's logged.

## I: Income and savings

- I1 **Income entries**: salary, student grant (opintoraha), housing supplement, gifts, with their own categories.
- I2 **Net per month**: income minus spending, the one number on Summary.
- I3 **Runway**: "money lasts until the 27th at this pace", towards the next payday or grant date.
- I4 **Savings goals**: "Japan trip 2 000 € by June", with a monthly amount needed and the pace so far.
- I5 **Pay yourself first**: on payday, Otso suggests moving X to savings, logged as a transfer, not an expense.
- I6 **Accounts lite**: cash, main account, savings, as hand-kept balances, reconciled when you say so.
- I7 **Paydays calendar**: known income dates (Kela on a fixed day, salary on the 15th), so forecasts know them.
- I8 **Savings rate** per month, and a 12-month line.
- I9 **"Can I afford it?"**: type 120 €, see the effect on the month, the goal and the runway.
- I10 **Round-up savings**: virtual, each expense rounded up to the euro into a "jar". Fun, maybe silly.
- I11 **Link to Otso Markets**: money moved to the brokers counted as savings, from the portfolio's cash flows.
- I12 **Student-life presets**: Kela study grant and housing supplement amounts and dates prefilled.

## N: Insights and nudges

- N1 **Pace nudge before the overspend**: "Food is at 80% with 12 days left", sent once, from code.
- N2 **Usual-by-now**: "you usually spend 140 € on food by the 10th; you're at 190".
- N3 **Category trends**: 6 months per category as small lines (blue or red only where it means up or down vs. budget).
- N4 **Weekday heatmap**: when the money goes (Fridays, payday weekend).
- N5 **Merchant top list**: where most of it goes (from descriptions and Apple Pay merchants).
- N6 **Anomaly flag**: an entry 3x the category's usual size.
- N7 **No-spend days** counter, quietly, no gamification noise.
- N8 **Month-end forecast** shown from day 1 using history, not just the current pace (fixes the day-5 gap).
- N9 **Price creep**: the same merchant costs more than it did ("Unicafe lunch up 0,20 €").
- N10 **Budget autopilot**: next month's budget suggested from this month's reality.
- N11 **Year in review**: December, a few honest slides about the year's money.
- N12 **Compare with last year's same month**.
- N13 **Cost per use**: the gym membership ÷ visits (from the calendar via Otso).
- N14 **Calendar-aware warnings**: a trip next week, so budget a bit for it now (Otso knows the calendar).
- N15 **Quiet hours for money nudges**: never after 21:00, never twice a day.

## D: The app itself (redesign)

- D1 **New name and identity**: Otso - Expenses, its own logo in the Otso family.
- D2 **English UI** with an i18n layer kept tiny (one strings file), so Finnish could come back.
- D3 **Four tabs, not five**: Log, Expenses, Money (summary + budget + income), Otso. Settings behind an icon.
- D4 **Real icons drawn for the app** (not Unicode glyphs, not Lucide).
- D5 **Accessibility pass**: AA contrast, labels, focus trap in sheets, keyboard reorder, aria-current.
- D6 **Charts over time**: more than one month at a time.
- D7 **Light mode**: no; true black only (or yes, contrarian: daylight on the metro).
- D8 **Instant open**: render the cached last state, then refresh (as the Otso app does).
- D9 **Haptic-feeling micro-motion** on save (a ray of the aurora runs across), respecting reduced motion.
- D10 **Settings split**: Categories, Budgets, Connections (Shortcut, Otso), Data (export, backup).
- D11 **Empty states that teach** (first launch: "log your first expense; Otso learns from it").
- D12 **Tablet/desktop layout** for month reviews on the laptop.

## F: Foundations and fixes (from the scan)

- F1 **Helsinki "today" in the database** (`current_date` in UTC logs 00:00-03:00 on the wrong day).
- F2 **`list_expenses` handles `(kuvaus)` categories** and returns `id` (and `source`).
- F3 **A stable `code` field** in RPC answers, so messages can be English without breaking Otso.
- F4 **Undo for chat-logged expenses** (keep the `id`).
- F5 **Future months visible** in the month navigation.
- F6 **Pin supabase-js and SheetJS with SRI**, add a CSP.
- F7 **Token docs tell the truth** (tokens can undo; read tokens read everything); rename and read toggle.
- F8 **Fewer full reloads**: only fetch the month on screen plus summaries (all transactions ever is fine now, not in 3 years).
- F9 **Server-side checks**: colour format, description length.
- F10 **Truncation flag** when `list_expenses` hits its 500 cap.

## X: Wild ones

- X1 **Otso-talk in the app**: its voice reads the monthly letter (it has a voice already).
- X2 **Money mood**: one word for the month chosen in code ("steady", "loose", "tight").
- X3 **Bet with Otso**: "I'll keep food under 250 this month", Otso keeps score all year.
- X4 **Envelope mode**: each category is an envelope; overspending one takes from another visibly.
- X5 **The bear hibernates**: in a no-spend weekend the logo sleeps.
- X6 **Export to a "money diary"** PDF each month for your own records.
- X7 **Share a read-only month** with a partner or a parent via a link.
- X8 **Receipts from email** shown in the app (Otso already reads them) with the PDF attached to the entry.
