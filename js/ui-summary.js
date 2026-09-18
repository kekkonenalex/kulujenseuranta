// ============================================================
//  YHTEENVETO-nakyma: valitun kuukauden kulut kategorioittain,
//  kokonaissumma ja vertailu edelliseen kuukauteen.
// ============================================================

import { summaryFor, monthTotalCents, monthTransactions } from './state.js';
import { state } from './state.js';
import {
  formatMoney, addMonths, monthLabelIn, monthLabel, formatDate,
} from './format.js';
import { qs, show, escapeHtml, openModal, closeModal } from './ui-common.js';

function comparisonText(currentCents, previousMonth) {
  const previousCents = monthTotalCents(previousMonth);
  const label = monthLabelIn(previousMonth);              // esim. 'elokuussa 2026'
  const capitalised = label.charAt(0).toUpperCase() + label.slice(1);

  if (previousCents === 0) return `${capitalised} ei kuluja.`;

  const diff = currentCents - previousCents;
  if (diff === 0) return `Sama kuin ${label}.`;

  const share = Math.round((Math.abs(diff) / previousCents) * 100);
  const direction = diff > 0 ? 'enemmän' : 'vähemmän';
  return `${formatMoney(Math.abs(diff))} (${share} %) ${direction} kuin ${label}.`;
}

export function renderSummaryView() {
  const summary = summaryFor(state.month);

  qs('#sum-total').textContent = formatMoney(summary.total);
  qs('#sum-count').textContent = summary.count === 1
    ? '1 kirjaus'
    : `${summary.count} kirjausta`;
  qs('#sum-compare').textContent = comparisonText(summary.total, addMonths(state.month, -1));

  show(qs('#sum-empty'), summary.rows.length === 0);

  const maxCents = summary.rows.reduce((max, row) => Math.max(max, row.cents), 0);

  qs('#sum-rows').innerHTML = summary.rows.map((row) => {
    const barWidth = maxCents ? Math.max(2, (row.cents / maxCents) * 100) : 0;
    return `
      <button type="button" class="sum-row summary-row"
              data-summary-category="${escapeHtml(row.categoryId)}">
        <div class="sum-row-top">
          <span class="dot" style="background:${escapeHtml(row.color)}"></span>
          <span class="sum-name">${escapeHtml(row.name)}</span>
          <span class="sum-amount">${escapeHtml(formatMoney(row.cents))}</span>
        </div>
        <div class="bar">
          <div class="bar-fill" style="width:${barWidth.toFixed(1)}%;background:${escapeHtml(row.color)}"></div>
        </div>
        <div class="sum-meta">
          <span>${row.share.toFixed(0)} % kuukauden kuluista</span>
          <span>${row.count} ${row.count === 1 ? 'kirjaus' : 'kirjausta'}</span>
        </div>
      </button>`;
  }).join('');
}

/* ------------------------------------------------------------
   Kategorian kirjaukset
   ------------------------------------------------------------ */

function transactionRowHtml(transaction) {
  return `
    <div class="modal-tx">
      <div class="modal-tx-main">
        <span class="modal-tx-date">${escapeHtml(formatDate(transaction.occurred_on))}</span>
        ${transaction.description
          ? `<span class="modal-tx-desc">${escapeHtml(transaction.description)}</span>`
          : ''}
      </div>
      <span class="modal-tx-amount">${escapeHtml(formatMoney(transaction.amount_cents))}</span>
    </div>`;
}

function openCategoryModal(categoryId) {
  const summary = summaryFor(state.month);
  const row = summary.rows.find((r) => r.categoryId === categoryId);
  if (!row) return;

  const transactions = monthTransactions(state.month)
    .filter((transaction) => transaction.category_id === categoryId);

  const sheet = openModal(`
    <h3 class="modal-title">
      <span class="dot" style="background:${escapeHtml(row.color)}"></span>
      ${escapeHtml(row.name)}
    </h3>
    <p class="muted small">
      ${escapeHtml(monthLabel(summary.month))} ·
      ${row.count} ${row.count === 1 ? 'kirjaus' : 'kirjausta'} ·
      ${row.share.toFixed(0)} % kuukauden kuluista
    </p>

    <div class="month-total">
      <span class="muted">Yhteensä</span>
      <strong>${escapeHtml(formatMoney(row.cents))}</strong>
    </div>

    <div class="modal-tx-list">${transactions.map(transactionRowHtml).join('')}</div>

    <div class="btn-row">
      <button type="button" class="btn btn-secondary" data-close>Sulje</button>
    </div>
  `);

  sheet.querySelector('[data-close]').addEventListener('click', closeModal);
}

export function initSummaryView() {
  qs('#sum-rows').addEventListener('click', (event) => {
    const row = event.target.closest('[data-summary-category]');
    if (row) openCategoryModal(row.dataset.summaryCategory);
  });
}
