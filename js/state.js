// ============================================================
//  Sovelluksen tila muistissa + johdetut laskennat.
//  Nakymat tilaavat muutokset subscribe():lla.
// ============================================================

import { currentMonth, monthOf, todayISO } from './format.js';

export const state = {
  user: null,
  categories: [],      // { id, name, color, sort_order, archived }
  transactions: [],     // { id, category_id, amount_cents, occurred_on, description }
  budgets: [],          // { id, category_id, year_month, amount_cents }
  deviceTokens: [],     // { id, name, created_at, last_used_at }
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

/* ------------------------------------------------------------
   Budjetit

   Perusbudjetti (year_month null) patee kaikkiin kuukausiin.
   Kuukausikohtainen rivi ylikirjoittaa sen omalta kuukaudeltaan.
   Kokonaisbudjettia ei tallenneta: se on kategoriabudjettien summa.
   ------------------------------------------------------------ */

export const BUDGET_WARN_SHARE = 80;   // % - talta osuudelta keltainen
export const BUDGET_OVER_SHARE = 100;  // % - talta osuudelta punainen

/** Kumpi rivi patee: kuukausiylikirjoitus, perusbudjetti vai ei mitaan. */
export function budgetRowFor(categoryId, month = state.month) {
  const override = state.budgets.find(
    (b) => b.category_id === categoryId && b.year_month === month,
  );
  if (override) return { row: override, kind: 'month' };

  const fallback = state.budgets.find(
    (b) => b.category_id === categoryId && !b.year_month,
  );
  if (fallback) return { row: fallback, kind: 'default' };

  return { row: null, kind: 'none' };
}

/** Budjetti sentteina tai null jos kategorialle ei ole budjettia. */
export function budgetCentsFor(categoryId, month = state.month) {
  const { row } = budgetRowFor(categoryId, month);
  return row ? row.amount_cents : null;
}

export function budgetStateFor(spentCents, budgetCents) {
  if (!budgetCents) return 'none';
  const share = (spentCents / budgetCents) * 100;
  if (share > BUDGET_OVER_SHARE) return 'over';
  if (share >= BUDGET_WARN_SHARE) return 'warn';
  return 'ok';
}

/**
 * Ennen tata paivaa ennustetta ei nayteta: kuukauden ensimmaisina
 * paivina yhden ison kulun (esim. vuokra) jakaminen kahdella paivalla
 * ja kertominen kolmellakymmenella antaa taysin harhaanjohtavan luvun.
 */
export const FORECAST_MIN_DAYS = 5;

/**
 * Kuluvan kuukauden ennuste: talla tahdilla kuukausi paattyy summaan X.
 *
 * Palauttaa null jos kuukausi ei ole kuluva (menneessa kuussa toteuma on
 * jo lopullinen) tai jos kuukautta on kulunut liian vahan luotettavaan
 * arvioon.
 *
 * Tulevalle paivalle kirjatut kulut eivat kuulu tahdin laskentaan vaan
 * lisataan ennusteeseen sellaisenaan - muuten yksi etukateen kirjattu
 * kulu moninkertaistuisi.
 */
export function forecastCentsFor(month = state.month) {
  if (month !== currentMonth()) return null;

  const now = new Date();
  const dayOfMonth = now.getDate();
  if (dayOfMonth < FORECAST_MIN_DAYS) return null;

  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const today = todayISO();
  const rows = monthTransactions(month);

  const spentSoFar = rows
    .filter((tx) => tx.occurred_on <= today)
    .reduce((sum, tx) => sum + tx.amount_cents, 0);
  const scheduled = rows
    .filter((tx) => tx.occurred_on > today)
    .reduce((sum, tx) => sum + tx.amount_cents, 0);

  if (dayOfMonth >= daysInMonth) return spentSoFar + scheduled;
  return Math.round((spentSoFar / dayOfMonth) * daysInMonth) + scheduled;
}

/** Onko kuluva kuukausi viela liian nuori ennusteelle. */
export function forecastTooEarly(month = state.month) {
  return month === currentMonth() && new Date().getDate() < FORECAST_MIN_DAYS;
}

/**
 * Budjettinakyman data yhdelle kuukaudelle.
 *
 * rows          - kategoriat joilla on budjetti, suurin ylitys ensin
 * withoutBudget - kategoriat joilla ei ole budjettia (kulut mukana)
 * totalBudget   - kategoriabudjettien summa
 * totalSpent    - kulut budjetoiduissa kategorioissa
 * unbudgetedSpent - kulut kategorioissa joilla ei ole budjettia
 */
export function budgetSummaryFor(month = state.month) {
  const spentByCategory = new Map();
  for (const tx of monthTransactions(month)) {
    spentByCategory.set(tx.category_id, (spentByCategory.get(tx.category_id) || 0) + tx.amount_cents);
  }

  const rows = [];
  const withoutBudget = [];

  for (const category of allCategoriesSorted()) {
    const spentCents = spentByCategory.get(category.id) || 0;
    const { row, kind } = budgetRowFor(category.id, month);

    // Arkistoitu kategoria nakyy vain jos silla on taman kuun kuluja
    // tai voimassa oleva budjetti.
    if (category.archived && !spentCents && !row) continue;

    const entry = {
      categoryId: category.id,
      name: category.name,
      color: category.color,
      archived: category.archived,
      spentCents,
      budgetCents: row ? row.amount_cents : null,
      budgetId: row ? row.id : null,
      kind,
      share: row && row.amount_cents ? (spentCents / row.amount_cents) * 100 : 0,
      remainingCents: row ? row.amount_cents - spentCents : 0,
      status: budgetStateFor(spentCents, row ? row.amount_cents : null),
    };

    if (row) rows.push(entry);
    else withoutBudget.push(entry);
  }

  rows.sort((a, b) => b.share - a.share);
  withoutBudget.sort((a, b) => b.spentCents - a.spentCents);

  const totalBudget = rows.reduce((sum, r) => sum + r.budgetCents, 0);
  const totalSpent = rows.reduce((sum, r) => sum + r.spentCents, 0);
  const unbudgetedSpent = withoutBudget.reduce((sum, r) => sum + r.spentCents, 0);

  return {
    month,
    rows,
    withoutBudget,
    totalBudget,
    totalSpent,
    unbudgetedSpent,
    remainingCents: totalBudget - totalSpent,
    share: totalBudget ? (totalSpent / totalBudget) * 100 : 0,
    status: budgetStateFor(totalSpent, totalBudget),
    forecastCents: forecastCentsFor(month),
  };
}

/** Oletuspaiva kirjaukselle: tanaan. */
export function defaultEntryDate() {
  return todayISO();
}
