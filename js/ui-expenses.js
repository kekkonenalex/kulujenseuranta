// ============================================================
//  Expenses: the month's list by day, or, with words in Find, every expense that matches with their
//  total (L14). Each shows where it came from (you, the Shortcut, Otso: O4) and a flag when something
//  looks wrong (O3, N6). Tapping one opens it to change or delete.
// ============================================================

import * as db from './db.js';
import {
  state, setState, monthTransactions, findTransactions, categoryById, activeCategories, sourceOf, SOURCE_LABEL,
  flags, flagFor, dismissFlag,
} from './state.js';
import {
  formatMoney, dayHeading, monthName, parseAmountToCents, formatAmount, isValidISODate, todayISO, formatDay, monthOf,
} from './format.js';
import {
  escapeHtml, safeColor, openSheet, closeSheet, toast, setBusy, showError, clearError, confirmSheet,
} from './ui-common.js';
import { icon } from './icons.js';

const FILTERS = [['all', 'All'], ['you', 'You'], ['shortcut', 'Shortcut'], ['otso', 'Otso'], ['flagged', 'Flagged']];

export function renderExpenses(panel) {
  if (!state.loaded) { panel.innerHTML = '<p class="empty">Loading…</p>'; return; }
  const searching = Boolean(state.query.trim()) || state.filter !== 'all';
  const flagged = new Set(flags().map((f) => f.tx.id));
  const rows = searching ? findTransactions(state.query, state.filter) : monthTransactions(state.month);

  // Keep the Find box as it is while typing: only the results below are drawn again.
  if (!panel.querySelector('#find-input')) {
    panel.innerHTML = `
      <div class="find">
        <div class="find-box">${icon('search', { size: 20 })}
          <input type="search" id="find-input" placeholder="Find: coffee, wolt, 12,50, october…" autocomplete="off" aria-label="Find expenses"></div>
        <div class="word-tabs" role="group" aria-label="Show">${FILTERS.map(([key, label]) =>
          `<button type="button" class="word-tab" data-filter="${key}">${label}</button>`).join('')}</div>
      </div>
      <div id="expense-results"></div>`;
    const input = panel.querySelector('#find-input');
    input.addEventListener('input', () => setState({ query: input.value }));
    panel.querySelectorAll('[data-filter]').forEach((chip) => chip.addEventListener('click', () => {
      setState({ filter: state.filter === chip.dataset.filter ? 'all' : chip.dataset.filter });
    }));
    panel.addEventListener('click', (event) => {
      const row = event.target.closest('[data-tx]');
      if (row) openExpense(row.dataset.tx);
    });
  }
  const input = panel.querySelector('#find-input');
  if (input.value !== state.query) input.value = state.query;
  panel.querySelectorAll('[data-filter]').forEach((chip) => chip.setAttribute('aria-pressed', String(chip.dataset.filter === state.filter)));

  const results = panel.querySelector('#expense-results');
  const total = rows.reduce((s, tx) => s + tx.amount_cents, 0);
  const head = searching
    ? `<p class="found" aria-live="polite">${rows.length} found · <b class="num">${escapeHtml(formatMoney(total))}</b>${rows.length > 300 ? ' (the newest 300 shown)' : ''}</p>`
    : `<p class="found">${escapeHtml(monthName(state.month))}: ${rows.length} expense${rows.length === 1 ? '' : 's'} · <b class="num">${escapeHtml(formatMoney(total))}</b></p>`;
  if (!rows.length) {
    results.innerHTML = head + `<p class="empty">${searching ? 'Nothing matches.' : 'Nothing logged this month. Press + to log one.'}</p>`;
    return;
  }
  results.innerHTML = head + byDay(rows.slice(0, 300), flagged, searching);
}

function byDay(rows, flagged, searching) {
  const days = new Map();
  for (const tx of rows) {
    if (!days.has(tx.occurred_on)) days.set(tx.occurred_on, []);
    days.get(tx.occurred_on).push(tx);
  }
  return [...days.entries()].map(([iso, txs]) => {
    const sum = txs.reduce((s, tx) => s + tx.amount_cents, 0);
    const label = searching && monthOf(iso) !== monthOf(todayISO()) ? formatDay(iso) : dayHeading(iso);
    return `<section class="day" aria-label="${escapeHtml(label)}">
      <div class="day-head"><span>${escapeHtml(label)}</span><span class="num">${escapeHtml(formatMoney(sum))}</span></div>
      <div class="group">${txs.map((tx) => txRow(tx, flagged.has(tx.id))).join('')}</div></section>`;
  }).join('');
}

export function txRow(tx, isFlagged = false) {
  const cat = categoryById(tx.category_id);
  const source = sourceOf(tx);
  return `
    <button type="button" class="tx" data-tx="${escapeHtml(tx.id)}">
      <span class="dot" style="background:${safeColor(cat && cat.color)}"></span>
      <span class="tx-main"><span class="tx-cat">${escapeHtml(cat ? cat.name : 'Deleted category')}</span>
        ${tx.description ? `<span class="tx-desc">${escapeHtml(tx.description)}</span>` : ''}</span>
      <span><span class="tx-amount">${escapeHtml(formatMoney(tx.amount_cents))}</span>
        <span class="tx-meta">${isFlagged ? '<span class="tag tag-check">check</span>' : ''}${source !== 'you' ? `<span class="tag tag-${source}">${SOURCE_LABEL[source]}</span>` : ''}</span></span>
    </button>`;
}

/* ---------- One expense: change it, delete it (with Undo), or say a flag is fine ---------- */

export function openExpense(txId) {
  const tx = state.transactions.find((t) => t.id === txId);
  if (!tx) return;
  const flag = flagFor(tx.id);
  const source = sourceOf(tx);
  const cats = activeCategories();
  const current = categoryById(tx.category_id);
  if (current && current.archived) cats.push(current);
  const token = state.deviceTokens.find((t) => t.id === tx.device_token_id);
  const from = source === 'you' ? 'Logged in the app' : `Logged by ${SOURCE_LABEL[source]}${token ? ` (${token.name})` : ''}`;

  const body = openSheet('Expense', `
    ${flag ? `<p class="alert alert-info">${escapeHtml(flag.reason)}</p>` : ''}
    <p class="muted small">${escapeHtml(from)}, ${escapeHtml(formatDay(tx.created_at.slice(0, 10)))}.</p>
    <div class="field"><label for="tx-amount">Amount, €</label>
      <input id="tx-amount" inputmode="decimal" autocomplete="off" value="${escapeHtml(formatAmount(tx.amount_cents))}"></div>
    <div class="field"><span class="label" id="tx-cat-label">Category</span>
      <div class="pick-list" role="group" aria-labelledby="tx-cat-label">${cats.map((c) => `
        <button type="button" class="pick" data-cat="${escapeHtml(c.id)}" aria-pressed="${c.id === tx.category_id}">
          <span class="dot" style="background:${safeColor(c.color)}"></span><span>${escapeHtml(c.name)}</span></button>`).join('')}</div></div>
    <div class="field"><label for="tx-date">Day</label><input type="date" id="tx-date" value="${escapeHtml(tx.occurred_on)}"></div>
    <div class="field"><label for="tx-note">Note</label><input id="tx-note" maxlength="300" value="${escapeHtml(tx.description || '')}"></div>
    <p id="tx-error" class="alert alert-error" role="alert" hidden></p>
    <div class="btn-row">
      <button type="button" class="btn btn-danger" data-delete>Delete</button>
      ${flag ? '<button type="button" class="btn btn-quiet" data-fine>It\'s right</button>' : ''}
      <button type="button" class="btn btn-primary" data-save>Save</button>
    </div>`);

  let categoryId = tx.category_id;
  body.querySelectorAll('[data-cat]').forEach((chip) => chip.addEventListener('click', () => {
    categoryId = chip.dataset.cat;
    body.querySelectorAll('[data-cat]').forEach((c) => c.setAttribute('aria-pressed', String(c === chip)));
  }));
  body.querySelector('[data-save]').addEventListener('click', async (event) => {
    const errorBox = body.querySelector('#tx-error');
    clearError(errorBox);
    const cents = parseAmountToCents(body.querySelector('#tx-amount').value);
    const day = body.querySelector('#tx-date').value;
    if (cents === null) { showError(errorBox, 'Write the amount in euros, like 12,40.'); return; }
    if (!isValidISODate(day)) { showError(errorBox, 'Pick the day.'); return; }
    setBusy(event.currentTarget, true);
    try {
      const updated = await db.updateTransaction(tx.id, {
        amountCents: cents, categoryId, occurredOn: day, description: body.querySelector('#tx-note').value,
      });
      setState({ transactions: state.transactions.map((t) => (t.id === tx.id ? updated : t)) });
      if (flag) dismissFlag(flag.key);
      closeSheet();
      toast('Saved');
    } catch (err) {
      showError(errorBox, err.message);
      setBusy(event.currentTarget, false);
    }
  });
  const fine = body.querySelector('[data-fine]');
  if (fine) fine.addEventListener('click', () => { dismissFlag(flag.key); closeSheet(); toast('Marked as right'); });
  body.querySelector('[data-delete]').addEventListener('click', () => deleteWithUndo(tx));
}

/** Delete now, with a few seconds to put it back exactly as it was (O6 uses this too). */
export async function deleteWithUndo(tx, { ask = true } = {}) {
  if (ask) {
    const sure = await confirmSheet({ title: 'Delete this expense?', body: `${formatMoney(tx.amount_cents)}, ${formatDay(tx.occurred_on)}. You can undo it for a few seconds.` });
    if (!sure) return false;
  }
  try {
    await db.deleteTransaction(tx.id);
  } catch (err) {
    toast(err.message, 'error');
    return false;
  }
  setState({ transactions: state.transactions.filter((t) => t.id !== tx.id) });
  closeSheet();
  toast(`Deleted ${formatMoney(tx.amount_cents)}`, 'ok', {
    label: 'Undo',
    run: async () => {
      try {
        const back = await db.createTransaction({
          categoryId: tx.category_id, amountCents: tx.amount_cents, occurredOn: tx.occurred_on,
          description: tx.description, deviceTokenId: tx.device_token_id,
        });
        setState({ transactions: [back, ...state.transactions] });
        toast('Put back');
      } catch (err) {
        toast(err.message, 'error');
      }
    },
  });
  return true;
}

