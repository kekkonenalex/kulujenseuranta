# Otso - Expenses: anchor

The fixed points for the redesign. Re-read before each step. (The repo is public: nothing private here.)

## North star

Rename the expense tracker (kulujenseuranta) to **Otso - Expenses**. It stays its own app, separate from
the Otso app. Otso then lives *inside* it, and the redesign makes it a clear sibling of Otso. The goals:
- logging an expense is the fastest thing on the phone;
- the app understands your money: income, savings, patterns;
- it says something useful before you overspend, not after.

## Alex's answers (9 Nov 2026)

- **Otso's role:** inside the app. The brainstorm centres on an Otso layer in the expenses app itself (insights,
  asking Otso, flags, summaries). Telegram and the morning brief already exist; they're not the focus.
- **Look:** Otso family, but not the same design as the Otso app's tabs. This is its own app. Make a few
  different looks, each with a logo; Alex picks one.
- **Scope:** smarter logging; income and savings; insights and nudges. Bank import is out (not chosen).
- **Language and stack:** English UI. Keep the stack: plain HTML/CSS/JS with no build step, Supabase,
  GitHub Pages.

## Constraints (from scan.md section 6 and CLAUDE.md)

- EUR 0: Supabase free tier, GitHub Pages, no paid APIs without asking first. Any model use goes through Otso's
  existing Anthropic budget, cheap model by default.
- Pushing `main` deploys, so work on a branch. Bump `sw.js` VERSION and `config.js` APP_VERSION together.
- Don't break the iPhone Shortcut contract: the RPC names, the `p_*` argument names, the ` (kuvaus)` marker and
  the `message` field.
- Don't break Otso's RPC contract either, including the Finnish substrings it matches. Add a `code` field
  before translating any server message.
- Schema changes go in idempotent, separately runnable SQL sections that Alex pastes into the SQL Editor
  (that's a "Waiting on you" step).
- Pin exact CDN versions and add SRI. Keep money as integer cents.
- Design: Alex's banned list:
  - Lucide, emoji, liquid glass, em dashes;
  - Inter, Geist, Space Grotesk;
  - bento grids, purple on black, radial orbs, dot grids, sparkles, rainbow colours.

  Otso's identity: true black, aurora as thin vertical rays, the Schibsted Grotesk and Atkinson
  Hyperlegible fonts.

  Markets numbers are blue for up and red for down, never green. Spending isn't markets, but still don't
  read green as "good spending".
- How Otso gets in: the browser can't hold an Anthropic key. Anything model-made comes from Otso's server,
  through Tailscale-only endpoints, Supabase rows Otso writes with its token, or a Supabase Edge Function.
  Which one is a decision for the plan.

## Flow

1. Scan: done (`scan.md`).
2. Brainstorm, crackhead-energy: `ideas.md`.
3. Design looks, aura-farming: `looks.html`, several directions, each with a logo.
4. Council (llm-council) on the ideas: `verdict.md`.
5. Report to Alex what was approved and what was denied, with reasons. Alex picks a look.
6. Only then plan the build and build it on a branch.

## Decisions log

- 9 Nov: the scan's bugs (UTC today, the `(kuvaus)` filter, the missing `id`, future months) go to the council
  as candidates like any other idea, not as automatic fixes.
- 10 Nov, Alex:
  - Look **A Kulta** (amber rays). Accepted all three reversals:
    - Ask Otso moves to build 2;
    - live warnings and tap questions stay in Telegram;
    - the app opens on Month.
  - Defaults accepted:
    - the Finnish category names stay;
    - the GitHub repo and Pages path stay;
    - no staging database: a contract test runs before and after each SQL paste;
    - no Web Push in build 1.
- Build 1 = the 31 approved ids in verdict.md, in its four slices, on branch `otso-expenses`.
