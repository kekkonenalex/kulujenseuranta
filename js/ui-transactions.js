// ============================================================
//  KULUT-nakyma: valitun kuukauden kirjaukset paivittain,
//  napautus avaa muokkauksen ja poiston.
// ============================================================

import * as db from './db.js';
import {
  state, setState, monthTransactions, monthTotalCents, categoryById, allCategoriesSorted,
} from './state.js';
import {
  formatMoney, formatDayHeading, parseAmountToCents, isValidISODate,
} from './format.js';
import {
  qs, show, showError, clearError, setBusy, toast, escapeHtml,
  openModal, closeModal, confirmModal,
} from './ui-common.js';

function groupByDay(transactions) {
  const groups = new Map();
  for (const tx of transactions) {
    if (!groups.has(tx.occurred_on)) groups.set(tx.occurred_on, []);
    groups.get(tx.occurred_on).push(tx);
  }
  return groups;
}

function renderList() {
  const transactions = monthTransactions();
  const list = qs('#tx-list');

  qs('#tx-month-total').textContent = formatMoney(monthTotalCents());
  show(qs('#tx-empty'), transactions.length === 0);

  if (transactions.length === 0) {
    list.innerHTML = '';
    return;
  }

  const groups = groupByDay(transactions);
  let html = '';

  for (const [day, dayTransactions] of groups) {
    const dayTotal = dayTransactions.reduce((sum, tx) => sum + tx.amount_cents, 0);
    html += `
      <div class="tx-day-head">
        <span>${escapeHtml(formatDayHeading(day))}</span>
        <span>${escapeHtml(formatMoney(dayTotal))}</span>
      </div>`;

    for (const tx of dayTransactions) {
      const cat = categoryById(tx.category_id);
      html += `
        <button type="button" class="tx-item" data-tx="${escapeHtml(tx.id)}">
          <span class="dot" style="background:${escapeHtml(cat ? cat.color : '#6b7280')}"></span>
          <span class="tx-main">
            <span class="tx-cat">${escapeHtml(cat ? cat.name : 'Poistettu kategoria')}</span>
            ${tx.description ? `<span class="tx-desc">${escapeHtml(tx.description)}</span>` : ''}
          </span>
          <span class="tx-amount">${escapeHtml(formatMoney(tx.amount_cents))}</span>
        </button>`;
    }
  }

  list.innerHTML = html;
}

function categoryOptions(selectedId) {
  return allCategoriesSorted().map((cat) => `
    <option value="${escapeHtml(cat.id)}"${cat.id === selectedId ? ' selected' : ''}>
      ${escapeHtml(cat.name)}${cat.archived ? ' (arkistoitu)' : ''}
    </option>`).join('');
}

function openEditModal(transactionId) {
  const tx = state.transactions.find((t) => t.id === transactionId);
  if (!tx) return;

  const sheet = openModal(`
    <h3 class="modal-title">Muokkaa kirjausta</h3>

    <label for="edit-tx-amount">Summa (€)</label>
    <input type="text" id="edit-tx-amount" inputmode="decimal"
           value="${escapeHtml((tx.amount_cents / 100).toFixed(2).replace('.', ','))}">

    <label for="edit-tx-category">Kategoria</label>
    <select id="edit-tx-category">${categoryOptions(tx.category_id)}</select>

    <label for="edit-tx-date">Päivämäärä</label>
    <input type="date" id="edit-tx-date" value="${escapeHtml(tx.occurred_on)}">

    <label for="edit-tx-description">Kuvaus</label>
    <input type="text" id="edit-tx-description" maxlength="120"
           value="${escapeHtml(tx.description || '')}">

    <div id="edit-tx-error" class="alert alert-error hidden" role="alert"></div>

    <div class="btn-row">
      <button type="button" class="btn btn-secondary" data-cancel>Peruuta</button>
      <button type="button" class="btn btn-primary" data-save>Tallenna</button>
    </div>
    <button type="button" class="btn btn-danger-outline btn-block" data-delete>Poista kirjaus</button>
  `);

  sheet.querySelector('[data-cancel]').addEventListener('click', closeModal);

  sheet.querySelector('[data-save]').addEventListener('click', async () => {
    const errorBox = sheet.querySelector('#edit-tx-error');
    const saveButton = sheet.querySelector('[data-save]');
    clearError(errorBox);

    const amountCents = parseAmountToCents(sheet.querySelector('#edit-tx-amount').value);
    const categoryId = sheet.querySelector('#edit-tx-category').value;
    const occurredOn = sheet.querySelector('#edit-tx-date').value;
    const description = sheet.querySelector('#edit-tx-description').value.trim();

    if (amountCents === null) { showError(errorBox, 'Anna summa muodossa 12,50.'); return; }
    if (!categoryId) { showError(errorBox, 'Valitse kategoria.'); return; }
    if (!isValidISODate(occurredOn)) { showError(errorBox, 'Tarkista päivämäärä.'); return; }

    setBusy(saveButton, true);
    try {
      const updated = await db.updateTransaction(tx.id, {
        amountCents, categoryId, occurredOn, description,
      });
      setState({
        transactions: state.transactions.map((t) => (t.id === tx.id ? updated : t)),
      });
      closeModal();
      toast('Kirjaus päivitetty', 'ok');
    } catch (err) {
      showError(errorBox, err.message);
      setBusy(saveButton, false);
    }
  });

  sheet.querySelector('[data-delete]').addEventListener('click', async () => {
    closeModal();
    const confirmed = await confirmModal({
      title: 'Poistetaanko kirjaus?',
      body: `${formatMoney(tx.amount_cents)} – tätä ei voi peruuttaa.`,
      confirmLabel: 'Poista',
    });
    if (!confirmed) return;
    try {
      await db.deleteTransaction(tx.id);
      setState({ transactions: state.transactions.filter((t) => t.id !== tx.id) });
      toast('Kirjaus poistettu', 'ok');
    } catch (err) {
      toast(err.message, 'error');
    }
  });
}

export function initTransactionsView() {
  qs('#tx-list').addEventListener('click', (event) => {
    const item = event.target.closest('[data-tx]');
    if (item) openEditModal(item.dataset.tx);
  });
}

export function renderTransactionsView() {
  renderList();
}
