// ============================================================
//  Formatting and dates. Money is shown the Finnish way (12,40 €, 1 234,56 €), the words in English.
//
//  Dates travel as ISO strings 'YYYY-MM-DD'. Date objects are only made locally, at noon or midnight
//  of the local day, so a time zone never moves a day.
// ============================================================

const moneyFmt = new Intl.NumberFormat('fi-FI', {
  style: 'currency', currency: 'EUR', minimumFractionDigits: 2, maximumFractionDigits: 2,
});
const wholeFmt = new Intl.NumberFormat('fi-FI', {
  style: 'currency', currency: 'EUR', minimumFractionDigits: 0, maximumFractionDigits: 0,
});
const plainFmt = new Intl.NumberFormat('fi-FI', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September',
  'October', 'November', 'December'];
const SHORT_MONTHS = MONTHS.map((m) => m.slice(0, 3));
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/* ---------- Money (always cents inside) ---------- */

export function formatMoney(cents) {
  return moneyFmt.format((Number(cents) || 0) / 100);
}

/** Whole euros, for headlines and scales: 1 120 €. */
export function formatMoneyWhole(cents) {
  return wholeFmt.format(Math.round((Number(cents) || 0) / 100));
}

/** The number only, 1 234,56 (inputs). */
export function formatAmount(cents) {
  return plainFmt.format((Number(cents) || 0) / 100);
}

/**
 * What someone typed, in cents: a comma or a point for decimals, spaces for thousands, a € anywhere.
 * null when it isn't a positive amount.
 */
export function parseAmountToCents(input) {
  const cleaned = String(input ?? '')
    .replace(/[\s  ]/g, '')
    .replace(/€/g, '')
    .replace(',', '.');
  if (!/^\d{1,9}(\.\d{1,2})?$/.test(cleaned)) return null;
  const cents = Math.round(parseFloat(cleaned) * 100);
  if (!Number.isFinite(cents) || cents <= 0 || cents > 100000000) return null;
  return cents;
}

/** Euros as a number, for the Excel export. */
export function centsToEuros(cents) {
  return Math.round(Number(cents) || 0) / 100;
}

/* ---------- Dates ---------- */

const pad = (n) => String(n).padStart(2, '0');

export function isoFromDate(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function dateFromISO(iso) {
  const [y, m, d] = String(iso).split('-').map(Number);
  return new Date(y, m - 1, d || 1, 12);
}

export function todayISO() {
  return isoFromDate(new Date());
}

export function addDaysISO(iso, days) {
  const date = dateFromISO(iso);
  date.setDate(date.getDate() + days);
  return isoFromDate(date);
}

export function isValidISODate(iso) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(iso || ''))) return false;
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d;
}

/** 'YYYY-MM-DD' -> 'YYYY-MM' */
export function monthOf(iso) {
  return String(iso || '').slice(0, 7);
}

export function currentMonth() {
  return monthOf(todayISO());
}

export function addMonths(monthKey, delta) {
  const [y, m] = monthKey.split('-').map(Number);
  const dt = new Date(y, m - 1 + delta, 1);
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}`;
}

export function daysInMonth(monthKey) {
  const [y, m] = monthKey.split('-').map(Number);
  return new Date(y, m, 0).getDate();
}

/** '2026-11' -> 'November 2026'; this year's months without the year when `short`. */
export function monthLabel(monthKey, { short = false } = {}) {
  const [y, m] = monthKey.split('-').map(Number);
  const name = MONTHS[m - 1];
  return short && y === new Date().getFullYear() ? name : `${name} ${y}`;
}

export function monthName(monthKey) {
  return MONTHS[Number(monthKey.split('-')[1]) - 1];
}

/** '2026-11-09' -> '9 Nov 2026' */
export function formatDate(iso) {
  const date = dateFromISO(iso);
  return `${date.getDate()} ${SHORT_MONTHS[date.getMonth()]} ${date.getFullYear()}`;
}

/** '2026-11-09' -> 'Mon 9 Nov' (and the year when it isn't this one). */
export function formatDay(iso) {
  const date = dateFromISO(iso);
  const year = date.getFullYear() === new Date().getFullYear() ? '' : ` ${date.getFullYear()}`;
  return `${WEEKDAYS[date.getDay()]} ${date.getDate()} ${SHORT_MONTHS[date.getMonth()]}${year}`;
}

/** A list's day heading: 'Today', 'Yesterday', or 'Mon 9 Nov'. */
export function dayHeading(iso) {
  const today = todayISO();
  if (iso === today) return 'Today';
  if (iso === addDaysISO(today, -1)) return 'Yesterday';
  if (iso === addDaysISO(today, 1)) return 'Tomorrow';
  return formatDay(iso);
}

/** 9 -> '9th' */
export function ordinal(day) {
  const n = Number(day);
  const tail = n % 100 >= 11 && n % 100 <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' }[n % 10] || 'th');
  return `${n}${tail}`;
}

export function plural(n, one, many = `${one}s`) {
  return `${n} ${n === 1 ? one : many}`;
}
