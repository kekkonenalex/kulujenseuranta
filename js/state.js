// ============================================================
//  The app's state in memory, and everything worked out from it. All of it in the browser: a few
//  hundred expenses a year is nothing to add up. Views subscribe() to changes.
// ============================================================

import { addMonths, currentMonth, daysInMonth, monthOf, todayISO, addDaysISO } from './format.js';

export const state = {
  user: null,
  categories: [],     // { id, name, color, sort_order, archived, ask_description }
  transactions: [],   // { id, category_id, amount_cents, occurred_on, description, created_at, device_token_id }
  budgets: [],        // { id, category_id, year_month, amount_cents }
  deviceTokens: [],   // { id, name, created_at, last_used_at, can_read, can_note }
  income: [],         // { id, amount_cents, received_on, source, note, payday_id }
  paydays: [],        // { id, name, amount_cents, day_of_month, starts_on, ends_on }
  notes: [],          // Otso's: { id, key, kind, title, body, month, dismissed_at, updated_at }
  monthlyBudgets: [], // the budget for everything: { id, year_month (null: every month), amount_cents }
  hasMonthly: true,   // false while the database hasn't had sql/build1b.sql
  hasBuild1: true,    // false while the database hasn't had sql/build1.sql
  month: currentMonth(),
  view: 'month',
  query: '',
  filter: 'all',
  online: navigator.onLine,
  loaded: false,
};

const listeners = new Set();

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function emit() {
  for (const fn of listeners) {
    try { fn(state); } catch (err) { console.error('A view failed to draw:', err); }
  }
}

export function setState(patch) {
  Object.assign(state, patch);
  emit();
}

/* ---------- Categories ---------- */

export function categoryById(id) {
  return state.categories.find((c) => c.id === id) || null;
}

export function activeCategories() {
  return state.categories.filter((c) => !c.archived)
    .sort((a, b) => (a.sort_order - b.sort_order) || a.name.localeCompare(b.name, 'fi'));
}

export function allCategoriesSorted() {
  return state.categories.slice().sort((a, b) => Number(a.archived) - Number(b.archived)
    || (a.sort_order - b.sort_order) || a.name.localeCompare(b.name, 'fi'));
}

export function nextSortOrder() {
  return state.categories.reduce((max, c) => Math.max(max, c.sort_order || 0), 0) + 10;
}

export function transactionCountByCategory() {
  const counts = new Map();
  for (const tx of state.transactions) counts.set(tx.category_id, (counts.get(tx.category_id) || 0) + 1);
  return counts;
}

/* ---------- Where an expense came from (O4) ---------- */

/** 'you' (the app), 'otso' (Otso's token: the notes right, or "Otso" in its name) or 'shortcut'. */
export function sourceOf(tx) {
  if (!tx.device_token_id) return 'you';
  const token = state.deviceTokens.find((t) => t.id === tx.device_token_id);
  if (!token) return 'shortcut';
  return token.can_note || /otso/i.test(token.name) ? 'otso' : 'shortcut';
}

export const SOURCE_LABEL = { you: 'You', shortcut: 'Shortcut', otso: 'Otso' };

export function otsoToken() {
  return state.deviceTokens.find((t) => t.can_note) || state.deviceTokens.find((t) => /otso/i.test(t.name)) || null;
}

/* ---------- Expenses ---------- */

const newestFirst = (a, b) => (a.occurred_on < b.occurred_on ? 1 : a.occurred_on > b.occurred_on ? -1 : 0)
  || (a.created_at < b.created_at ? 1 : -1);

export function monthTransactions(month = state.month) {
  return state.transactions.filter((tx) => monthOf(tx.occurred_on) === month).sort(newestFirst);
}

export function monthTotalCents(month = state.month) {
  return monthTransactions(month).reduce((sum, tx) => sum + tx.amount_cents, 0);
}

/** The latest month the arrows go to: this one, or a later one with a future-dated expense in it (F5). */
export function lastMonth() {
  const latest = state.transactions.reduce((max, tx) => (monthOf(tx.occurred_on) > max ? monthOf(tx.occurred_on) : max),
    currentMonth());
  return latest;
}

/** Find (L14): every expense matching the words (category, note, amount, source), newest first. */
export function findTransactions(query, filter = 'all') {
  const words = String(query || '').trim().toLowerCase().split(/\s+/).filter(Boolean);
  const flagged = new Set(flags().map((f) => f.tx.id));
  return state.transactions.filter((tx) => {
    if (filter === 'flagged' && !flagged.has(tx.id)) return false;
    if (['you', 'shortcut', 'otso'].includes(filter) && sourceOf(tx) !== filter) return false;
    if (!words.length) return true;
    const cat = categoryById(tx.category_id);
    const hay = [cat ? cat.name : '', tx.description || '', (tx.amount_cents / 100).toFixed(2).replace('.', ','),
      SOURCE_LABEL[sourceOf(tx)], tx.occurred_on].join(' ').toLowerCase();
    return words.every((w) => hay.includes(w));
  }).sort(newestFirst);
}

/* ---------- Budgets: the month's own row, else the every-month one ---------- */

export function budgetRowFor(categoryId, month = state.month) {
  const own = state.budgets.find((b) => b.category_id === categoryId && b.year_month === month);
  if (own) return { row: own, kind: 'month' };
  const every = state.budgets.find((b) => b.category_id === categoryId && !b.year_month);
  if (every) return { row: every, kind: 'default' };
  return { row: null, kind: 'none' };
}

export function budgetCentsFor(categoryId, month = state.month) {
  const { row } = budgetRowFor(categoryId, month);
  return row ? row.amount_cents : null;
}

/** The month's budget for everything: its own, else the every-month one; { row, kind } or kind 'none'. */
export function monthlyBudgetFor(month = state.month) {
  const own = state.monthlyBudgets.find((b) => b.year_month === month);
  if (own) return { row: own, kind: 'month' };
  const every = state.monthlyBudgets.find((b) => !b.year_month);
  if (every) return { row: every, kind: 'default' };
  return { row: null, kind: 'none' };
}

/* ---------- History: what's usual by this day, and where the month is heading (N2, N8) ---------- */

const HISTORY_MONTHS = 3;

/**
 * Spent by the end of `day` in `month` (the day capped at that month's length), optionally one category.
 * Single expenses of 100 € or more are left out: they're one-offs (a flight booked, a hotel), and with them
 * "usual" swung by hundreds. The dry run of 10 Nov 2026 on real history: without them, October's forecast
 * was 1 210-1 245 € from the 3rd on, and the month ended at 1 277 €; with them, 1 904 € on the 3rd.
 */
const ONE_OFF = 10000;

function spentByDay(month, day, categoryId = null) {
  const last = `${month}-${String(Math.min(day, daysInMonth(month))).padStart(2, '0')}`;
  return state.transactions.reduce((sum, tx) => (monthOf(tx.occurred_on) === month && tx.occurred_on <= last
    && tx.amount_cents < ONE_OFF && (!categoryId || tx.category_id === categoryId) ? sum + tx.amount_cents : sum), 0);
}

/** The months before `month` that have any expenses, up to three. */
function pastMonths(month) {
  const have = new Set(state.transactions.map((tx) => monthOf(tx.occurred_on)));
  const found = [];
  for (let m = addMonths(month, -1), n = 0; n < 12 && found.length < HISTORY_MONTHS; m = addMonths(m, -1), n += 1) {
    if (have.has(m)) found.push(m);
  }
  return found;
}

const mean = (values) => (values.length ? Math.round(values.reduce((a, b) => a + b, 0) / values.length) : 0);

/**
 * The month so far against the usual one: { day, days, spent, usualByNow, usualMonth, forecast, months }.
 * usualByNow: on average, spent by this day in the last three months. forecast: what's spent so far, plus
 * what the usual month still spends after this day, plus anything dated later this month. From day 1 (it
 * doesn't need a pace). null for a past month, or without any history.
 */
export function paceFor(month = state.month, categoryId = null) {
  if (month !== currentMonth()) return null;
  const months = pastMonths(month);
  if (!months.length) return null;
  const today = todayISO();
  const day = Number(today.slice(8, 10));
  const days = daysInMonth(month);
  const rows = monthTransactions(month).filter((tx) => !categoryId || tx.category_id === categoryId);
  const spent = rows.filter((tx) => tx.occurred_on <= today).reduce((s, tx) => s + tx.amount_cents, 0);
  const later = rows.filter((tx) => tx.occurred_on > today).reduce((s, tx) => s + tx.amount_cents, 0);
  const usualByNow = mean(months.map((m) => spentByDay(m, day, categoryId)));
  const usualMonth = mean(months.map((m) => spentByDay(m, 31, categoryId)));
  return {
    day, days, spent, usualByNow, usualMonth, months: months.length,
    forecast: spent + Math.max(0, usualMonth - usualByNow) + later,
  };
}

/* ---------- The month by category, with budgets ---------- */

export function monthSummary(month = state.month) {
  const spent = new Map();
  const counts = new Map();
  for (const tx of monthTransactions(month)) {
    spent.set(tx.category_id, (spent.get(tx.category_id) || 0) + tx.amount_cents);
    counts.set(tx.category_id, (counts.get(tx.category_id) || 0) + 1);
  }
  const rows = [];
  for (const category of allCategoriesSorted()) {
    const spentCents = spent.get(category.id) || 0;
    const { row, kind } = budgetRowFor(category.id, month);
    if (category.archived && !spentCents) continue;
    if (!spentCents && !row) continue;
    rows.push({
      categoryId: category.id, name: category.name, color: category.color, spentCents,
      count: counts.get(category.id) || 0, budgetCents: row ? row.amount_cents : null, budgetKind: kind,
      over: Boolean(row) && spentCents > row.amount_cents,
    });
  }
  // (deleted categories' expenses, if any)
  for (const [id, cents] of spent) {
    if (!categoryById(id)) rows.push({ categoryId: id, name: 'Deleted category', color: '#6b6560', spentCents: cents, count: counts.get(id) || 0, budgetCents: null, budgetKind: 'none', over: false });
  }
  rows.sort((a, b) => b.spentCents - a.spentCents);
  const total = rows.reduce((s, r) => s + r.spentCents, 0);
  const budgeted = rows.filter((r) => r.budgetCents !== null);
  const categoriesBudget = budgeted.reduce((s, r) => s + r.budgetCents, 0);
  // The month's budget: the one for everything when it's set (against everything spent), else the
  // categories' budgets added up (against what's spent in them).
  const monthly = monthlyBudgetFor(month);
  return {
    month, total, count: monthTransactions(month).length, rows, categoriesBudget,
    budgetTotal: monthly.row ? monthly.row.amount_cents : categoriesBudget,
    budgetedSpent: monthly.row ? total : budgeted.reduce((s, r) => s + r.spentCents, 0),
    budgetKind: monthly.row ? (monthly.kind === 'month' ? 'month' : 'every') : 'categories',
  };
}

/** The month as one ray per day (the Month screen's signature): [{ day, iso, cents, future, today }]. */
export function daysOf(month = state.month) {
  const today = todayISO();
  const byDay = new Map();
  for (const tx of monthTransactions(month)) byDay.set(tx.occurred_on, (byDay.get(tx.occurred_on) || 0) + tx.amount_cents);
  const out = [];
  for (let d = 1; d <= daysInMonth(month); d += 1) {
    const iso = `${month}-${String(d).padStart(2, '0')}`;
    out.push({ day: d, iso, cents: byDay.get(iso) || 0, future: iso > today, today: iso === today });
  }
  return out;
}

/* ---------- Income (I1, I7), net (I2) and the savings rate (I8) ---------- */

/** Paydays falling in a month, as expected income: one a payday, on its day (the last day for a 31st). */
function paydaysIn(month) {
  const first = `${month}-01`;
  const last = `${month}-${String(daysInMonth(month)).padStart(2, '0')}`;
  return state.paydays.filter((p) => p.starts_on <= last && (!p.ends_on || p.ends_on >= first)).map((p) => ({
    payday: p, on: `${month}-${String(Math.min(p.day_of_month, daysInMonth(month))).padStart(2, '0')}`,
  }));
}

/**
 * The month's income: what came (income rows), and each payday not yet replaced by a real row for it.
 * { rows: [{ source, cents, on, expected, id?, paydayId? }], received, expected, total }
 */
export function incomeFor(month = state.month) {
  const today = todayISO();
  const rows = state.income.filter((i) => monthOf(i.received_on) === month).map((i) => ({
    id: i.id, source: i.source, cents: i.amount_cents, on: i.received_on, expected: false, paydayId: i.payday_id,
  }));
  const replaced = new Set(rows.filter((r) => r.paydayId).map((r) => r.paydayId));
  for (const { payday, on } of paydaysIn(month)) {
    if (replaced.has(payday.id)) continue;
    rows.push({ source: payday.name, cents: payday.amount_cents, on, expected: on > today, paydayId: payday.id, fromPayday: true });
  }
  rows.sort((a, b) => (a.on < b.on ? -1 : 1));
  const received = rows.filter((r) => !r.expected).reduce((s, r) => s + r.cents, 0);
  const expected = rows.filter((r) => r.expected).reduce((s, r) => s + r.cents, 0);
  return { rows, received, expected, total: received + expected };
}

/** Income, spending, what's left and the share saved, for a month. Spending for the current month is the forecast's. */
export function netFor(month = state.month) {
  const income = incomeFor(month);
  const spent = monthTotalCents(month);
  const net = income.total - spent;
  return { income, spent, net, rate: income.total > 0 ? net / income.total : null };
}

/* ---------- Flags (O3, N6): worked out here, never by a model ---------- */

// The thresholds were set by a dry run on real history (10 Nov 2026): "three times the median, 20 € or more"
// flagged 10 expenses in 45 days, every normal grocery run among them (a category's median is its small
// buys). Against the category's 90th percentile it was two, both worth a second look (a 44 € fuel stop,
// a 171 € hotel).
const ODD_TIMES = 2;            // an expense over twice the category's big ones (its 90th percentile)
const ODD_LEAST = 3000;         // and 30 € or more
const ODD_HISTORY = 8;          // the category needs this many other expenses to know its big ones
const FLAG_DAYS = 45;           // flags only look this far back

const DISMISSED_KEY = 'otso-expenses.flags-ok';

function dismissedFlags() {
  try { return new Set(JSON.parse(localStorage.getItem(DISMISSED_KEY) || '[]')); } catch { return new Set(); }
}

export function dismissFlag(key) {
  const set = dismissedFlags();
  set.add(key);
  try { localStorage.setItem(DISMISSED_KEY, JSON.stringify([...set].slice(-300))); } catch { /* private mode */ }
  emit();
}

function percentile(values, q) {
  const sorted = values.slice().sort((a, b) => a - b);
  const at = (sorted.length - 1) * q;
  const lo = Math.floor(at);
  const hi = Math.min(lo + 1, sorted.length - 1);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (at - lo);
}

const who = (tx) => (sourceOf(tx) === 'you' ? 'you in the app' : SOURCE_LABEL[sourceOf(tx)]);
const euro = (cents) => `${(cents / 100).toFixed(2).replace('.', ',')} €`;

/**
 * What looks wrong: [{ key, kind: 'double'|'odd', tx, other?, reason }].
 * double: the same amount, same day, same category, logged from two places (Apple Pay through Otso and by
 * hand, say), unless the two name different shops. odd: over twice the category's big expenses, 30 € or more.
 */
export function flags() {
  const since = addDaysISO(todayISO(), -FLAG_DAYS);
  const recent = state.transactions.filter((tx) => tx.occurred_on >= since);
  const ok = dismissedFlags();
  const out = [];
  const seen = new Map();
  for (const tx of recent.slice().sort((a, b) => (a.created_at < b.created_at ? -1 : 1))) {
    const key = `${tx.occurred_on}|${tx.amount_cents}|${tx.category_id}`;
    const earlier = seen.get(key);
    const twoShops = earlier && earlier.description && tx.description
      && earlier.description.trim().toLowerCase() !== tx.description.trim().toLowerCase();
    if (earlier && sourceOf(earlier) !== sourceOf(tx) && !twoShops) {
      out.push({ key: `double:${tx.id}`, kind: 'double', tx, other: earlier,
        reason: `The same ${euro(tx.amount_cents)} on the same day, logged twice: by ${who(earlier)} and by ${who(tx)}. Delete one?` });
    }
    if (!earlier) seen.set(key, tx);
  }
  const byCategory = new Map();
  for (const tx of state.transactions) {
    if (!byCategory.has(tx.category_id)) byCategory.set(tx.category_id, []);
    byCategory.get(tx.category_id).push(tx);
  }
  for (const tx of recent) {
    const others = (byCategory.get(tx.category_id) || []).filter((o) => o.id !== tx.id).map((o) => o.amount_cents);
    if (others.length < ODD_HISTORY) continue;
    const big = percentile(others, 0.9);
    if (tx.amount_cents >= ODD_LEAST && tx.amount_cents > ODD_TIMES * big) {
      const cat = categoryById(tx.category_id);
      out.push({ key: `odd:${tx.id}`, kind: 'odd', tx,
        reason: `Bigger than any usual ${cat ? cat.name : 'expense'}: most are under ${euro(Math.round(big))}. Right amount, right category?` });
    }
  }
  return out.filter((f) => !ok.has(f.key));
}

export function flagFor(txId) {
  return flags().find((f) => f.tx.id === txId) || null;
}

/* ---------- Otso's notes ---------- */

/** Otso's read card (O1) for this month, unless dismissed. */
export function readCard() {
  return state.notes.find((n) => n.kind === 'read' && !n.dismissed_at && (!n.month || n.month === currentMonth())) || null;
}

export function letters() {
  return state.notes.filter((n) => n.kind === 'letter').sort((a, b) => ((a.month || '') < (b.month || '') ? 1 : -1));
}

/** What Otso logged in the last seven days, newest first (O6). */
export function loggedByOtso(days = 7) {
  const since = new Date(Date.now() - days * 86400000).toISOString();
  return state.transactions.filter((tx) => sourceOf(tx) === 'otso' && tx.created_at >= since).sort(newestFirst);
}
