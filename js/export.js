// ============================================================
//  VIENTI: Excel (.xlsx) ja JSON-varmuuskopio + varmuuskopion tuonti.
//
//  SheetJS ladataan vasta kun vientia kaytetaan - se ei hidasta
//  sovelluksen kaynnistysta puhelimessa.
// ============================================================

import * as db from './db.js';
import { APP_VERSION } from './config.js';
import {
  state, categoryById, summaryFor, monthsWithData, budgetCentsFor, budgetSummaryFor,
} from './state.js';
import { centsToEuros, todayISO, monthLabel } from './format.js';
import {
  qs, toast, setBusy, downloadBlob, confirmModal,
} from './ui-common.js';

const SHEETJS_URL = 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js';
let sheetJsPromise = null;

function loadSheetJs() {
  if (window.XLSX) return Promise.resolve(window.XLSX);
  if (sheetJsPromise) return sheetJsPromise;

  sheetJsPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = SHEETJS_URL;
    script.async = true;
    script.onload = () => (window.XLSX
      ? resolve(window.XLSX)
      : reject(new Error('Excel-kirjastoa ei saatu ladattua.')));
    script.onerror = () => {
      sheetJsPromise = null;
      reject(new Error('Excel-kirjaston lataus ei onnistunut. Tarkista verkkoyhteys.'));
    };
    document.head.appendChild(script);
  });
  return sheetJsPromise;
}

/* ------------------------------------------------------------
   Excel-vienti
   ------------------------------------------------------------ */

const EUR_FORMAT = '#,##0.00\\ "€"';
const DATE_FORMAT = 'd.m.yyyy';
const PCT_FORMAT = '0.0\\ %';

function dateFromISO(iso) {
  const [y, m, d] = String(iso).split('-').map(Number);
  return new Date(y, m - 1, d);
}

function applyFormats(XLSX, sheet, formatsByColumn) {
  if (!sheet['!ref']) return;
  const range = XLSX.utils.decode_range(sheet['!ref']);
  for (let row = range.s.r + 1; row <= range.e.r; row += 1) {
    for (const [column, format] of Object.entries(formatsByColumn)) {
      const address = XLSX.utils.encode_cell({ r: row, c: Number(column) });
      if (sheet[address]) sheet[address].z = format;
    }
  }
}

function buildTransactionsSheet(XLSX) {
  const rows = state.transactions
    .slice()
    .sort((a, b) => (a.occurred_on < b.occurred_on ? -1 : a.occurred_on > b.occurred_on ? 1 : 0));

  const data = [['Päivämäärä', 'Kuukausi', 'Kategoria', 'Summa (€)', 'Kuvaus']];
  for (const tx of rows) {
    const cat = categoryById(tx.category_id);
    data.push([
      dateFromISO(tx.occurred_on),
      String(tx.occurred_on).slice(0, 7),
      cat ? cat.name : 'Poistettu kategoria',
      centsToEuros(tx.amount_cents),
      tx.description || '',
    ]);
  }

  const sheet = XLSX.utils.aoa_to_sheet(data, { cellDates: true });
  sheet['!cols'] = [{ wch: 12 }, { wch: 10 }, { wch: 22 }, { wch: 13 }, { wch: 34 }];
  sheet['!autofilter'] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: 0, c: 4 } }) };
  sheet['!freeze'] = { xSplit: 0, ySplit: 1 };
  applyFormats(XLSX, sheet, { 0: DATE_FORMAT, 3: EUR_FORMAT });
  return sheet;
}

function buildMonthlySheet(XLSX) {
  const data = [[
    'Kuukausi', 'Kategoria', 'Summa (€)', 'Budjetti (€)', 'Erotus (€)',
    'Osuus kuukaudesta', 'Kirjauksia',
  ]];

  for (const month of monthsWithData().slice().reverse()) {
    const summary = summaryFor(month);
    if (summary.count === 0) continue;

    for (const row of summary.rows) {
      const budgetCents = budgetCentsFor(row.categoryId, month);
      data.push([
        month,
        row.name,
        centsToEuros(row.cents),
        budgetCents === null ? '' : centsToEuros(budgetCents),
        budgetCents === null ? '' : centsToEuros(budgetCents - row.cents),
        row.share / 100,
        row.count,
      ]);
    }

    const budgetTotal = budgetSummaryFor(month).totalBudget;
    data.push([
      month,
      'YHTEENSÄ',
      centsToEuros(summary.total),
      budgetTotal ? centsToEuros(budgetTotal) : '',
      budgetTotal ? centsToEuros(budgetTotal - summary.total) : '',
      1,
      summary.count,
    ]);
  }

  const sheet = XLSX.utils.aoa_to_sheet(data);
  sheet['!cols'] = [
    { wch: 10 }, { wch: 24 }, { wch: 13 }, { wch: 13 }, { wch: 13 },
    { wch: 18 }, { wch: 11 },
  ];
  sheet['!freeze'] = { xSplit: 0, ySplit: 1 };
  applyFormats(XLSX, sheet, { 2: EUR_FORMAT, 3: EUR_FORMAT, 4: EUR_FORMAT, 5: PCT_FORMAT });
  return sheet;
}

function buildTotalsSheet(XLSX) {
  const data = [[
    'Kuukausi', 'Kuukausi (nimi)', 'Kulut yhteensä (€)', 'Budjetti (€)', 'Erotus (€)', 'Kirjauksia',
  ]];

  for (const month of monthsWithData().slice().reverse()) {
    const summary = summaryFor(month);
    if (summary.count === 0) continue;
    const budgetTotal = budgetSummaryFor(month).totalBudget;
    data.push([
      month,
      monthLabel(month),
      centsToEuros(summary.total),
      budgetTotal ? centsToEuros(budgetTotal) : '',
      budgetTotal ? centsToEuros(budgetTotal - summary.total) : '',
      summary.count,
    ]);
  }

  const sheet = XLSX.utils.aoa_to_sheet(data);
  sheet['!cols'] = [{ wch: 10 }, { wch: 18 }, { wch: 20 }, { wch: 13 }, { wch: 13 }, { wch: 11 }];
  applyFormats(XLSX, sheet, { 2: EUR_FORMAT, 3: EUR_FORMAT, 4: EUR_FORMAT });
  return sheet;
}

async function exportXlsx(button) {
  if (state.transactions.length === 0) {
    toast('Ei vietävää dataa.', 'error');
    return;
  }
  setBusy(button, true, 'Luodaan tiedostoa…');
  try {
    const XLSX = await loadSheetJs();
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, buildTransactionsSheet(XLSX), 'Transaktiot');
    XLSX.utils.book_append_sheet(workbook, buildMonthlySheet(XLSX), 'Kuukausiyhteenveto');
    XLSX.utils.book_append_sheet(workbook, buildTotalsSheet(XLSX), 'Kuukausisummat');

    const buffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array', cellDates: true });
    downloadBlob(
      new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
      `kulut-${todayISO()}.xlsx`,
    );
    toast('Excel-tiedosto luotu', 'ok');
  } catch (err) {
    toast(err.message, 'error');
  } finally {
    setBusy(button, false);
  }
}

/* ------------------------------------------------------------
   JSON-varmuuskopio
   ------------------------------------------------------------ */

function exportJson() {
  const payload = {
    app: 'kulujenseuranta',
    format_version: 1,
    app_version: APP_VERSION,
    exported_at: new Date().toISOString(),
    categories: state.categories.map((c) => ({
      id: c.id, name: c.name, color: c.color, sort_order: c.sort_order, archived: c.archived,
    })),
    transactions: state.transactions.map((t) => ({
      id: t.id,
      category_id: t.category_id,
      amount_cents: t.amount_cents,
      occurred_on: t.occurred_on,
      description: t.description || null,
    })),
    budgets: state.budgets.map((b) => ({
      id: b.id,
      category_id: b.category_id,
      year_month: b.year_month || null,
      amount_cents: b.amount_cents,
    })),
  };

  downloadBlob(
    new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }),
    `kulujenseuranta-varmuuskopio-${todayISO()}.json`,
  );
  toast('Varmuuskopio luotu', 'ok');
}

async function importJson(file, reloadData) {
  let payload;
  try {
    payload = JSON.parse(await file.text());
  } catch {
    toast('Tiedosto ei ole kelvollista JSONia.', 'error');
    return;
  }

  if (!payload || !Array.isArray(payload.categories) || !Array.isArray(payload.transactions)) {
    toast('Tiedosto ei näytä tämän sovelluksen varmuuskopiolta.', 'error');
    return;
  }

  const confirmed = await confirmModal({
    title: 'Tuodaanko varmuuskopio?',
    body: `Tiedostossa on ${payload.categories.length} kategoriaa, ${payload.transactions.length} kirjausta `
      + `ja ${(payload.budgets || []).length} budjettia. `
      + 'Nykyistä dataa ei poisteta: samannimiset kategoriat yhdistetään ja kirjaukset lisätään. '
      + 'Saman varmuuskopion tuominen kahdesti tuo kirjaukset kahteen kertaan.',
    confirmLabel: 'Tuo',
    danger: false,
  });
  if (!confirmed) return;

  try {
    const result = await db.importBackup(payload);
    await reloadData();
    const skippedNote = result.skipped ? `, ohitettu ${result.skipped}` : '';
    const budgetNote = result.budgetsAdded ? `, ${result.budgetsAdded} budjettia` : '';
    toast(
      `Tuotu ${result.inserted} kirjausta ja ${result.createdCategories} kategoriaa${budgetNote}${skippedNote}`,
      'ok',
    );
  } catch (err) {
    toast(err.message, 'error');
  }
}

/* ------------------------------------------------------------
   Kytkennat
   ------------------------------------------------------------ */

export function initExportView({ reloadData }) {
  qs('#btn-export-xlsx').addEventListener('click', (event) => exportXlsx(event.currentTarget));
  qs('#btn-export-json').addEventListener('click', exportJson);

  const fileInput = qs('#import-file');
  qs('#btn-import-json').addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', async () => {
    const file = fileInput.files && fileInput.files[0];
    fileInput.value = '';
    if (file) await importJson(file, reloadData);
  });
}
