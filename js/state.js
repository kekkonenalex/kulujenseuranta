// ============================================================
//  Sovelluksen tila muistissa + johdetut laskennat.
//  Nakymat tilaavat muutokset subscribe():lla.
// ============================================================

import { currentMonth, monthOf, todayISO } from './format.js';

export const state = {
  user: null,
  categories: [],      // { id, name, color, sort_order, archived }
  transactions: [],     // { id, category_id, amount_cents, occurred_on, description }
  month: currentMonth(), // valittu kuukausi 'YYYY-MM' (Kulut + Yhteenveto)
  view: 'entry',
  online: navigator.onLine,
};

const listeners = new Set();

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function emit() {
  for (const fn of listeners) {
    try { fn(state); } catch (err) { console.error('Tilan kuuntelija kaatui:', err); }
  }
}

export function setState(patch) {
  Object.assign(state, patch);
  emit();
}

/* ---------- Kategoriat ---------- */

export function categoryById(id) {
  return state.categories.find((c) => c.id === id) || null;
}

/** Kirjausnakymassa nakyvat kategoriat (ei arkistoituja). */
export function activeCategories() {
  return state.categories
    .filter((c) => !c.archived)
    .slice()
    .sort((a, b) => (a.sort_order - b.sort_order) || a.name.localeCompare(b.name, 'fi'));
}

export function allCategoriesSorted() {
  return state.categories
    .slice()
    .sort((a, b) => Number(a.archived) - Number(b.archived)
      || (a.sort_order - b.sort_order)
      || a.name.localeCompare(b.name, 'fi'));
}

export function nextSortOrder() {
  return state.categories.reduce((max, c) => Math.max(max, c.sort_order || 0), 0) + 10;
}

export function transactionCountByCategory() {
  const counts = new Map();
  for (const tx of state.transactions) {
    counts.set(tx.category_id, (counts.get(tx.category_id) || 0) + 1);
  }
  return counts;
}

/* ---------- Transaktiot ---------- */

/** Kuukauden transaktiot, uusin ensin. */
export function monthTransactions(month = state.month) {
  return state.transactions
    .filter((tx) => monthOf(tx.occurred_on) === month)
    .sort((a, b) => (a.occurred_on < b.occurred_on ? 1 : a.occurred_on > b.occurred_on ? -1 : 0)
      || (a.created_at < b.created_at ? 1 : -1));
}

export function monthTotalCents(month = state.month) {
  return monthTransactions(month).reduce((sum, tx) => sum + tx.amount_cents, 0);
}

/** Kuukaudet joille loytyy kirjauksia, uusin ensin. */
export function monthsWithData() {
  const set = new Set(state.transactions.map((tx) => monthOf(tx.occurred_on)));
  set.add(currentMonth());
  return [...set].sort().reverse();
}

/**
 * Kuukausiyhteenveto: kategoriat suuruusjarjestyksessa + kokonaissumma.
 * Laskenta tehdaan selaimessa - datamaara on satoja rivaja vuodessa.
 */
export function summaryFor(month = state.month) {
  const txs = monthTransactions(month);
  const byCategory = new Map();

  for (const tx of txs) {
    const entry = byCategory.get(tx.category_id) || { cents: 0, count: 0 };
    entry.cents += tx.amount_cents;
    entry.count += 1;
    byCategory.set(tx.category_id, entry);
  }

  const total = txs.reduce((sum, tx) => sum + tx.amount_cents, 0);

  const rows = [...byCategory.entries()]
    .map(([categoryId, entry]) => {
      const cat = categoryById(categoryId);
      return {
        categoryId,
        name: cat ? cat.name : 'Poistettu kategoria',
        color: cat ? cat.color : '#6b7280',
        cents: entry.cents,
        count: entry.count,
        share: total ? (entry.cents / total) * 100 : 0,
      };
    })
    .sort((a, b) => b.cents - a.cents);

  return { month, total, count: txs.length, rows };
}

/** Oletuspaiva kirjaukselle: tanaan. */
export function defaultEntryDate() {
  return todayISO();
}
