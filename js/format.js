// ============================================================
//  Muotoilut ja paivamaarien kasittely (suomalainen locale).
//
//  Paivamaarat kuljetetaan aina ISO-merkkijonoina 'YYYY-MM-DD'.
//  Date-objekteja ei kayteta valituksessa, koska aikavyohyke-
//  muunnokset siirtaisivat paivan vaaraan suuntaan.
// ============================================================

const moneyFmt = new Intl.NumberFormat('fi-FI', {
  style: 'currency', currency: 'EUR',
  minimumFractionDigits: 2, maximumFractionDigits: 2,
});
const plainFmt = new Intl.NumberFormat('fi-FI', {
  minimumFractionDigits: 2, maximumFractionDigits: 2,
});
const monthFmt = new Intl.DateTimeFormat('fi-FI', { month: 'long', year: 'numeric' });
const weekdayFmt = new Intl.DateTimeFormat('fi-FI', { weekday: 'short' });

/* ---------- Rahasummat (sisaisesti aina sentteina) ---------- */

export function formatMoney(cents) {
  return moneyFmt.format((Number(cents) || 0) / 100);
}

/** Pelkka luku ilman valuuttamerkkia, esim. 1 234,56 */
export function formatAmount(cents) {
  return plainFmt.format((Number(cents) || 0) / 100);
}

/**
 * Lukee kayttajan syotteen sentteina. Hyvaksyy pilkun ja pisteen
 * desimaalierottimena sekä valilyonnit tuhaterottimena.
 * Palauttaa null jos syote ei ole kelvollinen positiivinen summa.
 */
export function parseAmountToCents(input) {
  const cleaned = String(input ?? '')
    .replace(/ /g, '')
    .replace(/\s/g, '')
    .replace(/€/g, '')
    .replace(',', '.');
  if (!/^\d{1,9}(\.\d{1,2})?$/.test(cleaned)) return null;
  const cents = Math.round(parseFloat(cleaned) * 100);
  if (!Number.isFinite(cents) || cents <= 0) return null;
  return cents;
}

/** Sentit euroina lukuna - kaytetaan Excel-viennissa. */
export function centsToEuros(cents) {
  return Math.round(Number(cents) || 0) / 100;
}

/* ---------- Paivamaarat ---------- */

const pad = (n) => String(n).padStart(2, '0');

export function isoFromDate(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function todayISO() {
  return isoFromDate(new Date());
}

export function addDaysISO(iso, days) {
  const [y, m, d] = iso.split('-').map(Number);
  return isoFromDate(new Date(y, m - 1, d + days));
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

/** '2026-09' -> 'syyskuu 2026' */
export function monthLabel(monthKey) {
  const [y, m] = monthKey.split('-').map(Number);
  return monthFmt.format(new Date(y, m - 1, 1));
}

/** '2026-09-01' -> '1.9.2026' */
export function formatDate(iso) {
  const [y, m, d] = String(iso).split('-').map(Number);
  return `${d}.${m}.${y}`;
}

/** '2026-09-01' -> 'ti 1.9.2026' */
export function formatDayHeading(iso) {
  const [y, m, d] = String(iso).split('-').map(Number);
  const wd = weekdayFmt.format(new Date(y, m - 1, d)).replace('.', '');
  return `${wd} ${d}.${m}.${y}`;
}

export function percent(part, total) {
  if (!total) return 0;
  return (part / total) * 100;
}

export function formatPercent(value) {
  return `${plainFmt.format(value).replace(',00', '')} %`;
}
