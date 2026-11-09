# Otso - Expenses: ledger

Re-read `anchor.md` before each step.

## Done
- **9 Nov.** Deep scan of the app and Otso's integration: `scan.md`.
- **9 Nov.** Brainstorm in crackhead-energy mode: 88 ideas in `ideas.md` (O, L, I, N, D, F, X).
- **9 Nov.** Four looks, each with its own logo: `looks.html`, published privately for Alex.
  - A Kulta: amber rays.
  - B Kuitti: the receipt.
  - C Kynsi: the claw tally.
  - D Raanu: the woven stripe.
- **9 Nov.** LLM council: 5 advisors and 5 peer reviews, then the chairman: `verdict.md` (31 approved, 29 later, 28 denied, of 88 ids).

## Waiting on Alex
- Pick a look (A-D), or a mix.
- Confirm the verdict, including the three reversals of their own choices (verdict.md).
- Answer the open questions in `verdict.md`.

## Next (after Alex answers)
- Write `plan.md`: build slices on a branch, plus SQL sections Alex pastes by hand.
- Peer reviewers raised these points; settle them in the plan:
  - There's no staging database. A contract-test script must pass before any SQL goes into the live
    project, and every SQL change has to keep v1.7, the Shortcut and Otso working.
  - Check whether the database's `current_date` really is UTC before F1.
  - A note pipe needs a token scope, so only Otso's token can write notes. Render everything
    escaped.
  - Dry-run every code-made flag, note and forecast read-only on Alex's real history before
    shipping.
  - Renaming must keep the Pages path, or the installed PWA, the service worker scope and Otso's
    `app_url` break.
  - Finnish category names in an English UI: the per-category Shortcuts hard-code the names.
