// ============================================================
//  Month: the screen the app opens on. What's spent, drawn as one ray a day; where the month is heading
//  against the usual one (N2, N8); Otso's read when there is one (O1); income, what's left and the share
//  saved (I2, I8); and each category against its budget. A category opens its expenses, biggest first
//  (O8), with its budget.
// ============================================================

import * as db from './db.js';
import {
  state, setState, monthSummary, daysOf, paceFor, netFor, readCard, monthTransactions, categoryById,
  budgetRowFor, SOURCE_LABEL, sourceOf,
} from './state.js';
import {
  formatMoney, formatMoneyWhole, monthName, ordinal, currentMonth, formatDay, parseAmountToCents, formatAmount,
} from './format.js';
import { escapeHtml, openSheet, closeSheet, toast, setBusy, showError, clearError } from './ui-common.js';
import { openIncome } from './ui-settings.js';
import { openExpense } from './ui-expenses.js';

export function renderMonth(panel) {
  if (!state.loaded) { panel.innerHTML = '<p class="empty">Loading the month…</p>'; return; }
  const month = state.month;
  const summary = monthSummary(month);
  const isNow = month === currentMonth();
  const pace = paceFor(month);
  const net = netFor(month);
  const card = isNow ? readCard() : null;

  // Two columns on a laptop (the month on the left, its categories on the right); one on a phone.
  panel.innerHTML = `
    <div class="col col-main">
      ${hero(summary, pace, isNow)}
      ${rays(month)}
      ${card ? readHtml(card) : ''}
      ${moneyHtml(net, isNow)}
    </div>
    <div class="col col-side">${categoriesHtml(summary)}</div>
  `;

  const dismiss = panel.querySelector('[data-dismiss-read]');
  if (dismiss) dismiss.addEventListener('click', () => dismissRead(card));
  panel.querySelectorAll('[data-category]').forEach((el) => el.addEventListener('click', () => openCategory(el.dataset.category)));
  const income = panel.querySelector('[data-income]');
  if (income) income.addEventListener('click', () => openIncome());
}

const whole = (cents) => escapeHtml(formatMoneyWhole(cents));
const roundEuro = (cents) => Math.round(cents / 100) * 100;

/* What's left of the budget is the budget less the fixed costs as expected (logged or not) and the day-to-day
   spending: paying the rent on the 1st changes nothing. "Usually" and the pace are day-to-day only. */
function hero(summary, pace, isNow) {
  const budget = summary.budgetTotal;
  const hasFixed = summary.fixedExpected > 0;
  const bits = [];
  if (budget) {
    const left = budget - summary.budgetedSpent;
    const whose = summary.budgetKind === 'month' ? ` (${escapeHtml(monthName(summary.month))}'s own)` : '';
    bits.push(`of <b class="num">${whole(budget)}</b> budget${whose}`);
    bits.push(left >= 0 ? `<b class="num">${whole(left)}</b> left` : `<span class="over">${whole(-left)} over</span>`);
  }
  let usual = '';
  if (pace && hasFixed) {
    usual = `<p class="hero-sub"><b class="num">${whole(pace.spent)}</b> day-to-day, usually <b class="num">${whole(pace.usualByNow)}</b> by the ${ordinal(pace.day)}</p>`;
  } else if (pace) {
    bits.push(`usually <b class="num">${whole(pace.usualByNow)}</b> by the ${ordinal(pace.day)}`);
  }
  let forecast = '';
  if (pace && pace.forecast > summary.total) {
    const over = budget && pace.forecast > budget ? `, <span class="over">over the budget</span>` : '';
    if (hasFixed) {
      const fixed = roundEuro(pace.fixedExpected);
      const dayToDay = roundEuro(pace.dayToDayForecast);
      const notLogged = pace.fixedLogged < pace.fixedExpected ? ' (not logged yet)' : '';
      forecast = `<p class="hero-sub">Heading for about <b class="num">${whole(fixed + dayToDay)}</b> by the month's end${over}: ${whole(fixed)} fixed${notLogged}, about ${whole(dayToDay)} day-to-day.</p>`;
    } else {
      forecast = `<p class="hero-sub">Heading for about <b class="num">${whole(pace.forecast)}</b> by the month's end${over}.</p>`;
    }
  }
  return `
    <div class="hero">
      <span class="hero-label">${isNow ? 'Spent so far' : `Spent in ${escapeHtml(monthName(summary.month))}`}</span>
      <span class="hero-amount num">${escapeHtml(formatMoney(summary.total))}</span>
      ${bits.length ? `<p class="hero-sub">${bits.join(' · ')}</p>` : ''}
      ${usual}
      ${forecast}
    </div>`;
}

function rays(month) {
  const days = daysOf(month); // (day-to-day only: the rent's day doesn't dwarf the others)
  const most = Math.max(1, ...days.map((d) => d.cents));
  const bars = days.map((d) => {
    const height = d.cents ? Math.max(4, Math.round((d.cents / most) * 100)) : 0;
    const cls = d.future ? 'future' : d.cents ? '' : 'none';
    const label = `${formatDay(d.iso)}: ${d.cents ? formatMoney(d.cents) : 'nothing'}`;
    return `<span class="${cls}${d.today ? ' today' : ''}" style="height:${d.cents ? height : 2}%" title="${escapeHtml(label)}"></span>`;
  }).join('');
  const biggest = days.reduce((a, b) => (b.cents > a.cents ? b : a), days[0]);
  const aria = biggest.cents ? `Day-to-day spending per day. The biggest day was ${formatDay(biggest.iso)}, ${formatMoney(biggest.cents)}.` : 'No day-to-day spending yet this month.';
  return `<div><div class="dayrays" role="img" aria-label="${escapeHtml(aria)}">${bars}</div>
    <div class="dayrays-axis" aria-hidden="true"><span>1</span><span>${Math.ceil(days.length / 2)}</span><span>${days.length}</span></div></div>`;
}

function readHtml(card) {
  return `
    <section class="read" aria-label="Otso's read">
      <div class="read-head"><span class="read-kicker">Otso's read</span>
        <button type="button" class="link-btn" data-dismiss-read>Hide</button></div>
      <h3 class="read-title">${escapeHtml(card.title)}</h3>
      <p class="read-body">${escapeHtml(card.body)}</p>
    </section>`;
}

async function dismissRead(card) {
  try {
    const updated = await db.dismissNote(card.id);
    setState({ notes: state.notes.map((n) => (n.id === card.id ? updated : n)) });
    toast("Hidden until Otso has something new to say");
  } catch (err) {
    toast(err.message, 'error');
  }
}

function moneyHtml(net, isNow) {
  if (!state.hasBuild1) return '';
  const { income } = net;
  if (!income.total) {
    return `<div class="section-head"><h2 class="section-title">Income</h2>
      <button type="button" class="link-btn" data-income>Add income</button></div>
      <p class="money-note">Add your paydays (a grant, a salary) to see what's left each month and how much of it you keep.</p>`;
  }
  const rate = net.rate === null ? '–' : `${Math.round(net.rate * 100)} %`;
  const expected = income.expected ? `${formatMoneyWhole(income.expected)} of it still to come` : '';
  return `
    <div class="section-head"><h2 class="section-title">Income and what's left</h2>
      <button type="button" class="link-btn" data-income>Income</button></div>
    <div class="money">
      <div><span class="label">Income</span><b>${escapeHtml(formatMoneyWhole(income.total))}</b></div>
      <div><span class="label">${isNow ? 'Left now' : 'Left'}</span><b class="${net.net < 0 ? 'neg' : ''}">${escapeHtml(formatMoneyWhole(net.net))}</b></div>
      <div><span class="label">Kept</span><b class="${net.net < 0 ? 'neg' : ''}">${escapeHtml(rate)}</b></div>
    </div>
    ${expected ? `<p class="money-note">${escapeHtml(expected)}.</p>` : ''}`;
}

function categoriesHtml(summary) {
  if (!summary.rows.length) {
    return `<div><h2 class="section-title">Categories</h2><p class="empty">Nothing logged in ${escapeHtml(monthName(summary.month))}. Press + to log an expense.</p></div>`;
  }
  const rows = summary.rows.map((r) => {
    const count = `${r.count} expense${r.count === 1 ? '' : 's'}`;
    if (r.fixed) {
      // A fixed cost: what's logged of what's expected, no bar, never red.
      return `
      <button type="button" class="row" data-category="${escapeHtml(r.categoryId)}">
        <span class="row-name">${escapeHtml(r.name)}</span>
        <span class="row-amount">${escapeHtml(formatMoney(r.spentCents))} <small>of ${whole(r.expectedCents)}</small></span>
        <span class="row-sub">${r.count ? escapeHtml(count) : 'not logged yet'} · fixed</span>
      </button>`;
    }
    const width = r.budgetCents ? Math.min(100, Math.round((r.spentCents / r.budgetCents) * 100)) : 0;
    const of = r.budgetCents !== null ? ` <small>/ ${escapeHtml(formatMoneyWhole(r.budgetCents))}</small>` : '';
    const left = r.budgetCents !== null
      ? (r.over ? `${formatMoney(r.spentCents - r.budgetCents)} over` : `${formatMoney(r.budgetCents - r.spentCents)} left`)
      : 'no budget';
    return `
      <button type="button" class="row${r.over ? ' over' : ''}" data-category="${escapeHtml(r.categoryId)}">
        <span class="row-name">${escapeHtml(r.name)}</span>
        <span class="row-amount">${escapeHtml(formatMoney(r.spentCents))}${of}</span>
        ${r.budgetCents !== null ? `<span class="bar"><i style="width:${width}%"></i></span>` : ''}
        <span class="row-sub">${escapeHtml(count)} · ${escapeHtml(left)}</span>
      </button>`;
  }).join('');
  return `<div><div class="section-head"><h2 class="section-title">Categories</h2><span class="muted small">tap for the expenses</span></div>
    <div class="rows">${rows}</div></div>`;
}

/* ---------- One category: its expenses biggest first (O8), the usual by now, its budget ---------- */

function openCategory(categoryId) {
  const month = state.month;
  const cat = categoryById(categoryId);
  const name = cat ? cat.name : 'Deleted category';
  const txs = monthTransactions(month).filter((tx) => tx.category_id === categoryId)
    .sort((a, b) => b.amount_cents - a.amount_cents);
  const total = txs.reduce((s, tx) => s + tx.amount_cents, 0);
  const pace = paceFor(month, categoryId);
  const { row, kind } = budgetRowFor(categoryId, month);

  const lines = txs.map((tx) => `
    <button type="button" class="tx" data-tx="${escapeHtml(tx.id)}">
      <span class="tx-main"><span class="tx-cat">${escapeHtml(tx.description || name)}</span>
        <span class="tx-desc">${escapeHtml(formatDay(tx.occurred_on))} · ${escapeHtml(SOURCE_LABEL[sourceOf(tx)])}</span></span>
      <span class="tx-amount">${escapeHtml(formatMoney(tx.amount_cents))}</span>
    </button>`).join('');
  const usual = pace && pace.usualByNow
    ? `<p class="sheet-text">Usually <b>${escapeHtml(formatMoney(pace.usualByNow))}</b> by the ${ordinal(pace.day)}; this month <b>${escapeHtml(formatMoney(pace.spent))}</b>.</p>` : '';

  const body = openSheet(name, `
    <p class="hero-sub"><b class="num">${escapeHtml(formatMoney(total))}</b> in ${escapeHtml(monthName(month))}, biggest first${row ? ` · budget ${escapeHtml(formatMoney(row.amount_cents))}${kind === 'month' ? ' (this month only)' : ''}` : ''}${cat && cat.fixed ? ' · fixed' : ''}</p>
    ${usual}
    ${lines ? `<div class="group">${lines}</div>` : '<p class="empty">Nothing this month.</p>'}
    ${cat ? '<div class="btn-row"><button type="button" class="btn btn-quiet" data-budget>Set the budget</button></div>' : ''}
  `);
  body.querySelectorAll('[data-tx]').forEach((el) => el.addEventListener('click', () => openExpense(el.dataset.tx)));
  const budgetButton = body.querySelector('[data-budget]');
  if (budgetButton) budgetButton.addEventListener('click', () => openBudget(categoryId));
}

/* ---------- A category's budget: every month, or this month only ---------- */

export function openBudget(categoryId, month = state.month, after = null) {
  const cat = categoryById(categoryId);
  if (!cat) return;
  const { row, kind } = budgetRowFor(categoryId, month);
  const body = openSheet(`Budget: ${cat.name}`, `
    <div class="field"><label for="budget-amount">Euros a month</label>
      <input id="budget-amount" inputmode="decimal" autocomplete="off" value="${row ? escapeHtml(formatAmount(row.amount_cents)) : ''}" placeholder="250"></div>
    <div class="word-tabs" role="group" aria-label="Which months">
      <button type="button" class="word-tab" data-scope="all" aria-pressed="${kind !== 'month'}">Every month</button>
      <button type="button" class="word-tab" data-scope="month" aria-pressed="${kind === 'month'}">${escapeHtml(monthName(month))} only</button>
    </div>
    <p class="hint">A month of its own keeps the every-month budget for the other months.</p>
    <p id="budget-error" class="alert alert-error" role="alert" hidden></p>
    <div class="btn-row">
      ${row ? '<button type="button" class="btn btn-danger" data-remove>Remove</button>' : ''}
      <button type="button" class="btn btn-primary" data-save>Save</button>
    </div>`, { focus: '#budget-amount' });

  let scope = kind === 'month' ? 'month' : 'all';
  body.querySelectorAll('[data-scope]').forEach((chip) => chip.addEventListener('click', () => {
    scope = chip.dataset.scope;
    body.querySelectorAll('[data-scope]').forEach((c) => c.setAttribute('aria-pressed', String(c === chip)));
  }));
  body.querySelector('[data-save]').addEventListener('click', async (event) => {
    const errorBox = body.querySelector('#budget-error');
    clearError(errorBox);
    const raw = body.querySelector('#budget-amount').value.trim();
    const cents = raw === '0' ? 0 : parseAmountToCents(raw);
    if (cents === null) { showError(errorBox, 'Write the budget in euros, like 250 or 99,50.'); return; }
    const yearMonth = scope === 'month' ? month : null;
    const existing = state.budgets.find((b) => b.category_id === categoryId && (b.year_month || null) === yearMonth);
    setBusy(event.currentTarget, true);
    try {
      const saved = await db.saveBudget({ id: existing ? existing.id : null, categoryId, yearMonth, amountCents: cents });
      setState({ budgets: existing ? state.budgets.map((b) => (b.id === saved.id ? saved : b)) : [...state.budgets, saved] });
      if (after) after(); else closeSheet();
      toast('Budget saved');
    } catch (err) {
      showError(errorBox, err.message);
      setBusy(event.currentTarget, false);
    }
  });
  const remove = body.querySelector('[data-remove]');
  if (remove) remove.addEventListener('click', async () => {
    try {
      await db.deleteBudget(row.id);
      setState({ budgets: state.budgets.filter((b) => b.id !== row.id) });
      if (after) after(); else closeSheet();
      toast(kind === 'month' ? `${monthName(month)}'s own budget removed` : 'Budget removed');
    } catch (err) {
      toast(err.message, 'error');
    }
  });
}
