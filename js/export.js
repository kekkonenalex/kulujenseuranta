// ============================================================
//  Export: Excel (.xlsx) for analysis, and the JSON backup with its restore.
//
//  SheetJS is loaded only when exporting, pinned to one version and checked against its hash (F6).
// ============================================================

import * as db from './db.js';
import { APP_VERSION } from './config.js';
import { state, categoryById, monthSummary, budgetCentsFor } from './state.js';
import { centsToEuros, todayISO, monthLabel, monthOf, dateFromISO } from './format.js';
import { toast, setBusy, downloadBlob, confirmSheet } from './ui-common.js';

const SHEETJS = {
  src: 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js',
  integrity: 'sha384-vtjasyidUo0kW94K5MXDXntzOJpQgBKXmE7e2Ga4LG0skTTLeBi97eFAXsqewJjw',
};
let sheetJsPromise = null;

function loadSheetJs() {
  if (window.XLSX) return Promise.resolve(window.XLSX);
  if (sheetJsPromise) return sheetJsPromise;
  sheetJsPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = SHEETJS.src;
    script.integrity = SHEETJS.integrity;
    script.crossOrigin = 'anonymous';
    script.async = true;
    script.onload = () => (window.XLSX ? resolve(window.XLSX) : reject(new Error("The Excel library didn't load.")));
    script.onerror = () => { sheetJsPromise = null; reject(new Error("The Excel library couldn't be loaded. Check the connection.")); };
    document.head.appendChild(script);
  });
  return sheetJsPromise;
}

const EUR_FORMAT = '#,##0.00\\ "€"';
const DATE_FORMAT = 'd.m.yyyy';
const PCT_FORMAT = '0.0\\ %';

function applyFormats(XLSX, sheet, formatsByColumn) {
  if (!sheet['!ref']) return;
  const range = XLSX.utils.decode_range(sheet['!ref']);
  for (let row = range.s.r + 1; row <= range.e.r; row += 1) {
    for (const [column, format] of Object.entries(formatsByColumn)) {
      const cell = sheet[XLSX.utils.encode_cell({ r: row, c: Number(column) })];
      if (cell) cell.z = format;
    }
  }
}

function months() {
  return [...new Set(state.transactions.map((tx) => monthOf(tx.occurred_on)))].sort();
}

function expensesSheet(XLSX) {
  const data = [['Date', 'Month', 'Category', 'Amount (€)', 'Note']];
  for (const tx of state.transactions.slice().sort((a, b) => (a.occurred_on < b.occurred_on ? -1 : 1))) {
    const cat = categoryById(tx.category_id);
    data.push([dateFromISO(tx.occurred_on), monthOf(tx.occurred_on), cat ? cat.name : 'Deleted category',
      centsToEuros(tx.amount_cents), tx.description || '']);
  }
  const sheet = XLSX.utils.aoa_to_sheet(data, { cellDates: true });
  sheet['!cols'] = [{ wch: 12 }, { wch: 10 }, { wch: 22 }, { wch: 13 }, { wch: 34 }];
  sheet['!autofilter'] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: 0, c: 4 } }) };
  applyFormats(XLSX, sheet, { 0: DATE_FORMAT, 3: EUR_FORMAT });
  return sheet;
}

function monthlySheet(XLSX) {
  const data = [['Month', 'Category', 'Spent (€)', 'Budget (€)', 'Left (€)', 'Share of the month', 'Expenses']];
  for (const month of months()) {
    const summary = monthSummary(month);
    for (const row of summary.rows) {
      const budget = budgetCentsFor(row.categoryId, month);
      data.push([month, row.name, centsToEuros(row.spentCents), budget === null ? '' : centsToEuros(budget),
        budget === null ? '' : centsToEuros(budget - row.spentCents), summary.total ? row.spentCents / summary.total : 0, row.count]);
    }
    data.push([month, 'TOTAL', centsToEuros(summary.total), summary.budgetTotal ? centsToEuros(summary.budgetTotal) : '',
      summary.budgetTotal ? centsToEuros(summary.budgetTotal - summary.budgetedSpent) : '', 1, summary.count]);
  }
  const sheet = XLSX.utils.aoa_to_sheet(data);
  sheet['!cols'] = [{ wch: 10 }, { wch: 24 }, { wch: 13 }, { wch: 13 }, { wch: 13 }, { wch: 18 }, { wch: 11 }];
  applyFormats(XLSX, sheet, { 2: EUR_FORMAT, 3: EUR_FORMAT, 4: EUR_FORMAT, 5: PCT_FORMAT });
  return sheet;
}

function totalsSheet(XLSX) {
  const data = [['Month', 'Month (name)', 'Spent (€)', 'Budget (€)', 'Left (€)', 'Expenses']];
  for (const month of months()) {
    const summary = monthSummary(month);
    data.push([month, monthLabel(month), centsToEuros(summary.total), summary.budgetTotal ? centsToEuros(summary.budgetTotal) : '',
      summary.budgetTotal ? centsToEuros(summary.budgetTotal - summary.budgetedSpent) : '', summary.count]);
  }
  const sheet = XLSX.utils.aoa_to_sheet(data);
  sheet['!cols'] = [{ wch: 10 }, { wch: 18 }, { wch: 13 }, { wch: 13 }, { wch: 13 }, { wch: 11 }];
  applyFormats(XLSX, sheet, { 2: EUR_FORMAT, 3: EUR_FORMAT, 4: EUR_FORMAT });
  return sheet;
}

export async function exportExcel(button) {
  if (!state.transactions.length) { toast('Nothing to export yet.', 'error'); return; }
  setBusy(button, true, 'Making the file…');
  try {
    const XLSX = await loadSheetJs();
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, expensesSheet(XLSX), 'Expenses');
    XLSX.utils.book_append_sheet(book, monthlySheet(XLSX), 'Months by category');
    XLSX.utils.book_append_sheet(book, totalsSheet(XLSX), 'Month totals');
    const buffer = XLSX.write(book, { bookType: 'xlsx', type: 'array', cellDates: true });
    downloadBlob(new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
      `otso-expenses-${todayISO()}.xlsx`);
    toast('Excel file made');
  } catch (err) {
    toast(err.message, 'error');
  } finally {
    setBusy(button, false);
  }
}

export function exportBackup() {
  const payload = {
    app: 'kulujenseuranta', format_version: 2, app_version: APP_VERSION, exported_at: new Date().toISOString(),
    categories: state.categories.map((c) => ({ id: c.id, name: c.name, color: c.color, sort_order: c.sort_order, archived: c.archived, ask_description: c.ask_description === true })),
    transactions: state.transactions.map((t) => ({ id: t.id, category_id: t.category_id, amount_cents: t.amount_cents, occurred_on: t.occurred_on, description: t.description || null })),
    budgets: state.budgets.map((b) => ({ id: b.id, category_id: b.category_id, year_month: b.year_month || null, amount_cents: b.amount_cents })),
    // (kept in the file for the record; restoring brings back categories, expenses and budgets)
    income: state.income, paydays: state.paydays,
  };
  downloadBlob(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }), `otso-expenses-backup-${todayISO()}.json`);
  toast('Backup saved');
}

export async function importBackupFile(file) {
  let payload;
  try { payload = JSON.parse(await file.text()); } catch { toast("That file isn't a backup (not JSON).", 'error'); return; }
  if (!payload || !Array.isArray(payload.categories) || !Array.isArray(payload.transactions)) {
    toast("That file doesn't look like this app's backup.", 'error');
    return;
  }
  const sure = await confirmSheet({
    title: 'Restore the backup?',
    body: `It has ${payload.categories.length} categories, ${payload.transactions.length} expenses and ${(payload.budgets || []).length} budgets. Nothing is deleted: categories with the same name are merged and the expenses added. Restoring the same file twice adds its expenses twice.`,
    confirmLabel: 'Restore', danger: false,
  });
  if (!sure) return;
  try {
    const result = await db.importBackup(payload);
    toast(`Restored ${result.inserted} expenses and ${result.createdCategories} categories${result.budgetsAdded ? `, ${result.budgetsAdded} budgets` : ''}${result.skipped ? ` (${result.skipped} skipped)` : ''}`);
  } catch (err) {
    toast(err.message, 'error');
  }
}
