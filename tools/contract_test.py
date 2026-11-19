"""The RPC contract the iPhone Shortcut and Otso depend on, checked against the live Supabase project.

There is no staging database (Otso - Expenses, verdict.md): run this before and right after pasting any SQL.

    python tools/contract_test.py            # read-only checks
    python tools/contract_test.py --write    # also logs 0,01 EUR and undoes it at once
    python tools/contract_test.py --after    # also the build-1 and build-2 additions (code, id, source,
                                             # truncated, notes; fixed, fixed_cents, Vuokra)
    python tools/contract_test.py --preview  # read-only: what sql/build2.sql would move (rent rows, budgets)

The project URL and publishable key come from js/config.js (public). The device token comes from the
environment (KULUT_TOKEN) or from Otso's private env file (default ~/.otso/.env). It is never printed.
Standard library only.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
import urllib.error
import urllib.request
import uuid
from datetime import date, timedelta
from pathlib import Path

HERE = Path(__file__).resolve().parents[1]
FAILED: list[str] = []


def config() -> tuple[str, str]:
    text = (HERE / "js" / "config.js").read_text(encoding="utf-8")
    url = re.search(r"SUPABASE_URL\s*=\s*'([^']+)'", text).group(1)
    key = re.search(r"SUPABASE_ANON_KEY\s*=\s*'([^']+)'", text).group(1)
    return url.rstrip("/"), key


def token(env_file: str) -> str:
    found = os.environ.get("KULUT_TOKEN", "").strip()
    if found:
        return found
    path = Path(env_file).expanduser()
    if path.exists():
        for line in path.read_text(encoding="utf-8").splitlines():
            if line.strip().startswith("KULUT_TOKEN="):
                return line.split("=", 1)[1].strip().strip('"').strip("'")
    sys.exit("No KULUT_TOKEN in the environment or in " + str(path))


def rpc(url: str, key: str, name: str, **params) -> dict:
    request = urllib.request.Request(f"{url}/rest/v1/rpc/{name}", data=json.dumps(params).encode(),
                                     headers={"apikey": key, "Content-Type": "application/json"}, method="POST")
    try:
        with urllib.request.urlopen(request, timeout=20) as response:
            return json.loads(response.read().decode() or "null")
    except urllib.error.HTTPError as exc:
        return {"_http": exc.code, "_body": exc.read().decode(errors="replace")[:300]}


def check(what: str, ok: bool, detail: str = "") -> None:
    print(f"  [{'PASS' if ok else 'FAIL'}] {what}" + (f"  ({detail})" if detail and not ok else ""))
    if not ok:
        FAILED.append(what)


def has(row: dict, *keys: str) -> bool:
    return isinstance(row, dict) and all(k in row for k in keys)


RENT_CENTS = 87500  # build2.sql moves Asuminen's expenses of exactly 875,00 EUR to Vuokra


def add_months(month: str, delta: int) -> str:
    y, m = map(int, month.split("-"))
    n = y * 12 + (m - 1) + delta
    return f"{n // 12:04d}-{n % 12 + 1:02d}"


def eur(cents) -> str:
    return "-" if cents is None else f"{cents / 100:.2f}".replace(".", ",") + " EUR"


def preview_build2(url: str, key: str, tok: str, names: list) -> None:
    """Read-only: what sql/build2.sql would do, from the RPCs Otso reads. Changes nothing."""
    print("\nsql/build2.sql preview (read-only)")
    asuminen = next((n for n in names if re.sub(r"\s*\(kuvaus\)\s*$", "", n).strip().lower() == "asuminen"), None)
    vuokra = next((n for n in names if re.sub(r"\s*\(kuvaus\)\s*$", "", n).strip().lower() == "vuokra"), None)
    print(f"  categories: Asuminen {'found' if asuminen else 'MISSING (build2 then creates no Vuokra)'}, "
          f"Vuokra {'already there' if vuokra else 'not yet'}")
    if asuminen:
        start, end = date.today() - timedelta(days=369), date.today() + timedelta(days=31)
        rows = rpc(url, key, "list_expenses", p_token=tok, p_from=start.isoformat(), p_to=end.isoformat(),
                   p_category=asuminen, p_limit=500)
        found = rows.get("expenses") or [] if isinstance(rows, dict) else []
        rent = [e for e in found if e.get("amount_cents") == RENT_CENTS]
        other = [e for e in found if e.get("amount_cents") != RENT_CENTS]
        print(f"  Asuminen, {start} to {end}: {len(found)} expenses; {len(rent)} of exactly {eur(RENT_CENTS)} would move")
        for e in rent:
            print(f"    move  {e.get('occurred_on')}  {eur(e.get('amount_cents'))}  from {e.get('source')}")
        for e in other:
            print(f"    stays {e.get('occurred_on')}  {eur(e.get('amount_cents'))}")
    for m in [add_months(date.today().strftime("%Y-%m"), d) for d in (-3, -2, -1, 0, 1)]:
        over = rpc(url, key, "expense_overview", p_token=tok, p_month=m)
        cats = {c.get("category"): c for c in (over.get("categories") or [])} if isinstance(over, dict) else {}
        a, v = cats.get("Asuminen") or {}, cats.get("Vuokra") or {}
        total = over.get("budget_total_cents") if isinstance(over, dict) else None
        line = f"  {m}: Asuminen budget {eur(a.get('budget_cents'))}, spent {eur(a.get('spent_cents'))}"
        if v:
            line += f"; Vuokra budget {eur(v.get('budget_cents'))}, spent {eur(v.get('spent_cents'))}"
        print(line + f"; budget total {eur(total)}")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--write", action="store_true", help="log 0,01 EUR and undo it")
    parser.add_argument("--after", action="store_true", help="check the build-1 and build-2 additions too")
    parser.add_argument("--preview", action="store_true", help="read-only: what sql/build2.sql would move")
    parser.add_argument("--env", default="~/.otso/.env")
    args = parser.parse_args()
    url, key = config()
    tok = token(args.env)
    bogus = "x" * 40

    print("The Shortcut's half")
    cats = rpc(url, key, "list_expense_categories", p_token=tok)
    names = cats.get("categories") if isinstance(cats, dict) else None
    check("list_expense_categories: ok, a list of names, a message",
          has(cats, "ok", "categories", "message") and cats["ok"] is True and isinstance(names, list)
          and all(isinstance(n, str) for n in names), str(cats)[:200])
    check("...the ' (kuvaus)' marker, where used, ends the name",
          all(not n.lower().count("(kuvaus)") or n.endswith(" (kuvaus)") for n in names or []))
    bad = rpc(url, key, "log_expense", p_token=bogus, p_amount=1, p_category="x")
    check("log_expense with an unknown token: ok false, a message for the notification",
          has(bad, "ok", "message") and bad["ok"] is False and isinstance(bad["message"], str), str(bad)[:200])

    print("Otso's half")
    month = date.today().strftime("%Y-%m")
    over = rpc(url, key, "expense_overview", p_token=tok, p_month=month)
    check("expense_overview: the keys Otso reads",
          has(over, "ok", "month", "categories", "total_cents", "previous_total_cents", "budget_total_cents",
              "forecast_cents") and over["ok"] is True, str(over)[:200])
    check("...each category's keys", all(has(c, "category", "spent_cents", "count", "budget_cents", "previous_cents")
                                        for c in over.get("categories") or []))
    rows = rpc(url, key, "list_expenses", p_token=tok, p_from=(date.today() - timedelta(days=30)).isoformat(),
               p_to=date.today().isoformat(), p_limit=50)
    check("list_expenses: ok, rows with the keys Otso reads",
          has(rows, "ok", "expenses") and rows["ok"] is True
          and all(has(e, "occurred_on", "category", "amount_cents", "description") for e in rows["expenses"]),
          str(rows)[:200])
    gone = rpc(url, key, "undo_expense", p_token=tok, p_id=str(uuid.uuid4()))
    check("undo_expense of nothing: ok false, and the text Otso matches ('kirjausta ei löydy')",
          has(gone, "ok", "message") and gone["ok"] is False and "kirjausta ei löydy" in gone["message"], str(gone)[:200])
    noread = rpc(url, key, "expense_overview", p_token=bogus)
    check("expense_overview without read rights: the text Otso matches ('lukuoikeutta')",
          has(noread, "ok", "message") and noread["ok"] is False and "lukuoikeutta" in noread["message"], str(noread)[:200])

    if args.after:
        print("Build 1 additions")
        check("codes: ok / unknown_token / not_found / no_read",
              cats.get("code") == "ok" and bad.get("code") == "unknown_token" and gone.get("code") == "not_found"
              and noread.get("code") == "no_read", f"{cats.get('code')} {bad.get('code')} {gone.get('code')} {noread.get('code')}")
        check("list_expenses rows carry id and source, and the answer says if it was cut",
              "truncated" in rows and all(has(e, "id", "source") for e in rows["expenses"]), str(rows)[:200])
        marked = next((n for n in names or [] if n.endswith(" (kuvaus)")), None)
        if marked:
            some = rpc(url, key, "list_expenses", p_token=tok, p_from=(date.today() - timedelta(days=400)).isoformat(),
                       p_to=date.today().isoformat(), p_category=marked, p_limit=5)
            check("list_expenses finds a '(kuvaus)' category by its marked name", some.get("ok") is True
                  and len(some.get("expenses") or []) > 0, str(some)[:200])
        note = rpc(url, key, "post_otso_note", p_token=bogus, p_key="t", p_kind="read", p_title="t", p_body="t")
        check("post_otso_note refuses a token without the note right", note.get("ok") is False, str(note)[:200])

        print("Build 2 additions (sql/build2.sql: fixed monthly costs)")
        rows_over = over.get("categories") or []
        check("expense_overview: fixed_cents, a whole number of cents",
              isinstance(over.get("fixed_cents"), int) and over["fixed_cents"] >= 0, str(over.get("fixed_cents")))
        check("...each category says whether it's fixed", bool(rows_over)
              and all(isinstance(c.get("fixed"), bool) for c in rows_over))
        vuokra = next((c for c in rows_over if c.get("category") == "Vuokra"), None)
        check("...Vuokra is there and fixed", bool(vuokra) and vuokra.get("fixed") is True, str(vuokra)[:200])
        if vuokra:
            expected = max(vuokra.get("spent_cents") or 0, vuokra.get("budget_cents")
                           if vuokra.get("budget_cents") is not None else vuokra.get("previous_cents") or 0)
            check("...fixed_cents counts Vuokra as expected (logged, else its budget, else last month)",
                  over.get("fixed_cents", -1) >= expected, f"{over.get('fixed_cents')} < {expected}")
        check("...the forecast, when there is one, includes the fixed costs",
              over.get("forecast_cents") is None or over["forecast_cents"] >= over.get("fixed_cents", 0),
              f"{over.get('forecast_cents')} vs {over.get('fixed_cents')}")
        check("...the keys Otso already reads are all still there",
              has(over, "ok", "code", "month", "categories", "total_cents", "previous_total_cents",
                  "budget_total_cents", "forecast_cents", "message"))
        check("list_expenses rows say whether their category is fixed",
              all(isinstance(e.get("fixed"), bool) for e in rows["expenses"]), str(rows["expenses"][:1])[:200])
        check("list_expense_categories has Vuokra",
              any(re.sub(r"\s*\(kuvaus\)\s*$", "", n).strip() == "Vuokra" for n in names or []))

    if args.preview:
        preview_build2(url, key, tok, names or [])

    if args.write:
        print("Write half (0,01 EUR, undone at once)")
        first = re.sub(r"\s*\(kuvaus\)\s*$", "", names[0]) if names else ""
        made = rpc(url, key, "log_expense", p_token=tok, p_amount=0.01, p_category=first,
                   p_description="contract test (undone)")
        check("log_expense: ok, an id, the message and the documented keys",
              has(made, "ok", "id", "message", "category", "amount_cents", "occurred_on", "month_spent_cents",
                  "budget_cents", "remaining_cents") and made["ok"] is True, str(made)[:200])
        if made.get("id"):
            undone = rpc(url, key, "undo_expense", p_token=tok, p_id=made["id"])
            check("undo_expense of it: ok", undone.get("ok") is True, str(undone)[:200])
            if args.after:
                check("the day it lands on is Helsinki's today", made.get("occurred_on") == date.today().isoformat(),
                      str(made.get("occurred_on")))

    print("\nall contract checks passed" if not FAILED else f"\nFAILED: {len(FAILED)}")
    return 1 if FAILED else 0


if __name__ == "__main__":
    raise SystemExit(main())
