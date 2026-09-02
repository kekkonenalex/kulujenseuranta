// ============================================================
//  BUDJETTI-nakyma: suunnittelu ja seuranta samassa paikassa.
//
//  Perusbudjetti patee kaikkiin kuukausiin; yksittaiselle
//  kuukaudelle voi asettaa oman summan joka ylikirjoittaa sen.
//  Kokonaisbudjetti on kategoriabudjettien summa.
// ============================================================

import * as db from './db.js';
import {
  state, setState, budgetSummaryFor, budgetRowFor, forecastTooEarly, FORECAST_MIN_DAYS,
} from './state.js';
import {
  formatMoney, parseAmountToCents, monthLabel, monthLabelIn,
} from './format.js';
import {
  qs, show, showError, clearError, setBusy, toast, escapeHtml,
  openModal, closeModal, confirmModal,
} from './ui-common.js';

/* ------------------------------------------------------------
   Renderointi
   ------------------------------------------------------------ */

function statusClass(status) {
  return status === 'over' ? 'is-over' : status === 'warn' ? 'is-warn' : 'is-ok';
}

function renderHero(summary) {
  const hasBudget = summary.totalBudget > 0;

  qs('#budget-total-spent').textContent = formatMoney(summary.totalSpent);
  qs('#budget-total-budget').textContent = hasBudget
    ? `Budjetti ${formatMoney(summary.totalBudget)}`
    : 'Ei budjetteja';

  const left = qs('#budget-total-left');
  if (hasBudget) {
    left.textContent = summary.remainingCents >= 0
      ? `Jäljellä ${formatMoney(summary.remainingCents)}`
      : `Yli ${formatMoney(-summary.remainingCents)}`;
    left.className = `budget-left ${statusClass(summary.status)}`;
  } else {
    left.textContent = '';
    left.className = 'budget-left';
  }

  const bar = qs('#budget-total-bar');
  bar.style.width = `${Math.min(100, summary.share).toFixed(1)}%`;
  bar.className = `bar-fill ${statusClass(summary.status)}`;
  qs('#budget-total-track').classList.toggle('hidden', !hasBudget);

  // Ennuste vain kuluvalle kuukaudelle, ja vasta kun kuukautta on
  // kulunut tarpeeksi ettei luku ole pelkkaa kohinaa.
  const forecast = qs('#budget-forecast');
  if (summary.forecastCents === null && forecastTooEarly(summary.month)) {
    forecast.textContent = `Ennuste näkyy kun kuukautta on kulunut ${FORECAST_MIN_DAYS} päivää.`;
    forecast.className = 'small muted';
    show(forecast, true);
  } else if (summary.forecastCents !== null && hasBudget) {
    const over = summary.forecastCents - summary.totalBudget;
    const tail = over > 0
      ? `— ylitys ${formatMoney(over)}`
      : `— alle budjetin ${formatMoney(-over)}`;
    forecast.textContent = `Tällä tahdilla kuukausi päättyy summaan ${formatMoney(summary.forecastCents)} ${tail}`;
    forecast.className = `small ${over > 0 ? 'is-over' : 'muted'}`;
    show(forecast, true);
  } else if (summary.forecastCents !== null) {
    forecast.textContent = `Tällä tahdilla kuukausi päättyy summaan ${formatMoney(summary.forecastCents)}`;
    forecast.className = 'small muted';
    show(forecast, true);
  } else {
    show(forecast, false);
  }

  const unbudgeted = qs('#budget-unbudgeted');
  if (summary.unbudgetedSpent > 0) {
    unbudgeted.textContent = `Lisäksi ${formatMoney(summary.unbudgetedSpent)} kategorioissa joilla ei ole budjettia`;
    show(unbudgeted, true);
  } else {
    show(unbudgeted, false);
  }
}

function budgetRowHtml(row) {
  const status = statusClass(row.status);
  const barWidth = Math.min(100, row.share).toFixed(1);
  const remaining = row.remainingCents >= 0
    ? `${formatMoney(row.remainingCents)} jäljellä`
    : `${formatMoney(-row.remainingCents)} yli`;
  const scope = row.kind === 'month' ? ' <span class="tag">vain tämä kuukausi</span>' : '';

  return `
    <button type="button" class="sum-row budget-row" data-budget-category="${escapeHtml(row.categoryId)}">
      <div class="sum-row-top">
        <span class="dot" style="background:${escapeHtml(row.color)}"></span>
        <span class="sum-name">${escapeHtml(row.name)}${scope}</span>
        <span class="sum-amount ${status}">${escapeHtml(formatMoney(row.spentCents))}</span>
      </div>
      <div class="bar">
        <div class="bar-fill ${status}" style="width:${barWidth}%"></div>
      </div>
      <div class="sum-meta">
        <span>${escapeHtml(formatMoney(row.budgetCents))} budjetti</span>
        <span class="${status}">${escapeHtml(remaining)}</span>
      </div>
    </button>`;
}

function unbudgetedRowHtml(row) {
  return `
    <button type="button" class="budget-unset-row" data-budget-category="${escapeHtml(row.categoryId)}">
      <span class="dot" style="background:${escapeHtml(row.color)}"></span>
      <span class="budget-unset-name">${escapeHtml(row.name)}</span>
      <span class="budget-unset-spent">${row.spentCents ? escapeHtml(formatMoney(row.spentCents)) : 'ei kuluja'}</span>
      <span class="budget-add">Aseta</span>
    </button>`;
}

export function renderBudgetView() {
  const summary = budgetSummaryFor(state.month);

  renderHero(summary);

  qs('#budget-rows').innerHTML = summary.rows.map(budgetRowHtml).join('');
  show(qs('#budget-rows'), summary.rows.length > 0);

  const unsetSection = qs('#budget-unset');
  if (summary.withoutBudget.length > 0) {
    unsetSection.innerHTML = `
      <div class="section-label"><span>Ei budjettia</span></div>
      ${summary.withoutBudget.map(unbudgetedRowHtml).join('')}`;
    show(unsetSection, true);
  } else {
    unsetSection.innerHTML = '';
    show(unsetSection, false);
  }

  const nothing = summary.rows.length === 0 && summary.withoutBudget.length === 0;
  show(qs('#budget-empty'), nothing);
}

/* ------------------------------------------------------------
   Budjetin asetus
   ------------------------------------------------------------ */

function openBudgetModal(categoryId) {
  const category = state.categories.find((c) => c.id === categoryId);
  if (!category) return;

  const month = state.month;
  const { row, kind } = budgetRowFor(categoryId, month);
  const monthName = monthLabel(month);
  const currentValue = row ? (row.amount_cents / 100).toFixed(2).replace('.', ',') : '';

  const sheet = openModal(`
    <h3 class="modal-title">${escapeHtml(category.name)}</h3>
    <p class="muted small">${escapeHtml(monthName)}</p>

    <label for="budget-amount">Budjetti kuukaudessa (€)</label>
    <input type="text" id="budget-amount" inputmode="decimal" value="${escapeHtml(currentValue)}"
           placeholder="esim. 400">

    <div class="section-label"><span>Mihin summa pätee</span></div>
    <label class="radio-row">
      <input type="radio" name="budget-scope" value="default"
             ${kind !== 'month' ? 'checked' : ''}>
      <span>
        <strong>Joka kuukausi</strong>
        <span class="muted small">Perusbudjetti, joka pätee kaikkiin kuukausiin</span>
      </span>
    </label>
    <label class="radio-row">
      <input type="radio" name="budget-scope" value="month"
             ${kind === 'month' ? 'checked' : ''}>
      <span>
        <strong>Vain ${escapeHtml(monthLabelIn(month))}</strong>
        <span class="muted small">Ylikirjoittaa perusbudjetin tältä kuukaudelta</span>
      </span>
    </label>

    <div id="budget-error" class="alert alert-error hidden" role="alert"></div>

    <div class="btn-row">
      <button type="button" class="btn btn-secondary" data-cancel>Peruuta</button>
      <button type="button" class="btn btn-primary" data-save>Tallenna</button>
    </div>
    ${row ? '<button type="button" class="btn btn-danger-outline btn-block" data-delete>Poista budjetti</button>' : ''}
  `);

  sheet.querySelector('[data-cancel]').addEventListener('click', closeModal);

  sheet.querySelector('[data-save]').addEventListener('click', async () => {
    const errorBox = sheet.querySelector('#budget-error');
    const saveButton = sheet.querySelector('[data-save]');
    clearError(errorBox);

    const amountCents = parseAmountToCents(sheet.querySelector('#budget-amount').value);
    if (amountCents === null) {
      showError(errorBox, 'Anna summa muodossa 400 tai 400,00.');
      return;
    }

    const scope = sheet.querySelector('input[name="budget-scope"]:checked').value;
    const yearMonth = scope === 'month' ? month : null;

    // Onko talle laajuudelle jo rivi? Silloin paivitetaan se.
    const existing = state.budgets.find(
      (b) => b.category_id === categoryId && (b.year_month || null) === yearMonth,
    );

    setBusy(saveButton, true);
    try {
      const saved = await db.saveBudget({
        id: existing ? existing.id : null,
        categoryId,
        yearMonth,
        amountCents,
      });
      const budgets = existing
        ? state.budgets.map((b) => (b.id === saved.id ? saved : b))
        : [...state.budgets, saved];
      setState({ budgets });
      closeModal();
      toast('Budjetti tallennettu', 'ok');
    } catch (err) {
      showError(errorBox, err.message);
      setBusy(saveButton, false);
    }
  });

  const deleteButton = sheet.querySelector('[data-delete]');
  if (deleteButton) {
    deleteButton.addEventListener('click', async () => {
      closeModal();
      const isMonth = kind === 'month';
      const confirmed = await confirmModal({
        title: 'Poistetaanko budjetti?',
        body: isMonth
          ? `Kategorian "${category.name}" oma summa kuukaudelle ${monthName} poistetaan. Perusbudjetti jää voimaan, jos sellainen on.`
          : `Kategorian "${category.name}" perusbudjetti poistetaan kaikilta kuukausilta.`,
        confirmLabel: 'Poista',
      });
      if (!confirmed) return;
      try {
        await db.deleteBudget(row.id);
        setState({ budgets: state.budgets.filter((b) => b.id !== row.id) });
        toast('Budjetti poistettu', 'ok');
      } catch (err) {
        toast(err.message, 'error');
      }
    });
  }
}

export function initBudgetView() {
  qs('#panel-budget').addEventListener('click', (event) => {
    const target = event.target.closest('[data-budget-category]');
    if (target) openBudgetModal(target.dataset.budgetCategory);
  });
}
