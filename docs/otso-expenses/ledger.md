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

## Waiting on Alex
1. `git push origin otso-expenses`. The commit is local: a push to the public repo needs Alex's OK.
2. Paste `sql/build1.sql` into Supabase's SQL Editor, then run
   `python tools/contract_test.py --after --write`.
3. Merge `otso-expenses` into `main`, which deploys. Open the app twice so the phone picks up the new
   version.
4. Settings → Connections: tick **Otso's notes** on Otso's token.

## Then (build 2, after two weeks of use)
Choose from what Alex actually opened. First candidate: Ask Otso as a mailbox through otso_notes. Others:
L5/L6 recurring, I3 runway, D6/N3 charts, D8 instant open.
