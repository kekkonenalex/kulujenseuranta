// ============================================================
//  Settings, split in six (D10): Categories, Budgets, Income, Connections (the Shortcut and Otso),
//  Data (Excel, backup) and Account. Each opens in the sheet.
// ============================================================

import * as db from './db.js';
import { APP_VERSION } from './config.js';
import {
  state, setState, allCategoriesSorted, nextSortOrder, transactionCountByCategory, budgetRowFor, incomeFor,
  monthlyBudgetFor,
} from './state.js';
import {
  formatMoney, formatDate, formatDay, parseAmountToCents, formatAmount, todayISO, isValidISODate, monthName, ordinal,
  monthLabel, addMonths,
} from './format.js';
import {
  qs, escapeHtml, safeColor, openSheet, closeSheet, toast, setBusy, showError, clearError, confirmSheet,
} from './ui-common.js';
import { icon } from './icons.js';
import { openBudget } from './ui-month.js';
import { exportExcel, exportBackup, importBackupFile } from './export.js';
import { signOut, reloadData } from './app.js';

const SHORTCUT_HELP = 'https://github.com/kekkonenalex/kulujenseuranta/blob/main/PIKAKOMENTO.md';
const PALETTE = ['#f5b544', '#d9772f', '#e8d5a8', '#8fa3ad', '#b4532a', '#c9a227', '#7d8f6a', '#a77b5c', '#d0bfa0', '#5f7480'];

const SECTIONS = [
  ['categories', 'Categories', 'Names, colours, order', openCategories],
  ['budgets', 'Budgets', 'The month, and each category', () => openBudgets(state.month)],
  ['income', 'Income', 'Paydays, and income that came', openIncome],
  ['connections', 'Connections', 'The iPhone Shortcut and Otso', openConnections],
  ['data', 'Data', 'Excel export, backup', openData],
  ['account', 'Account', 'Signed in as…', openAccount],
];

export function openSettings(section = null) {
  const found = SECTIONS.find(([key]) => key === section);
  if (found) { found[3](); return; }
  const body = openSheet('Settings', `<div class="menu group">${SECTIONS.map(([key, title, sub]) => `
    <button type="button" class="menu-item" data-section="${key}"><span><b>${title}</b><br><span>${key === 'account' && state.user ? escapeHtml(state.user.email || '') : sub}</span></span>${icon('next', { size: 18 })}</button>`).join('')}</div>`);
  body.querySelectorAll('[data-section]').forEach((el) => el.addEventListener('click', () => openSettings(el.dataset.section)));
}

const back = (html) => `<button type="button" class="link-btn" data-back>‹ Settings</button>${html}`;

function wireBack(body) {
  const button = body.querySelector('[data-back]');
  if (button) button.addEventListener('click', () => openSettings());
}

/* ---------- Categories: add, edit, archive, delete, drag to reorder ---------- */

function openCategories() {
  const cats = allCategoriesSorted();
  const body = openSheet('Categories', back(`
    <p class="hint">The order here is the order on the log sheet: drag by the handle. Archived ones keep their history.</p>
    <div id="cat-list">${cats.map((c) => `
      <div class="cat-row" data-cat-id="${escapeHtml(c.id)}">
        <span class="drag-handle" data-drag-handle aria-hidden="true">${icon('drag', { size: 18 })}</span>
        <span class="dot" style="background:${safeColor(c.color)}"></span>
        <span class="row-name">${escapeHtml(c.name)}${c.archived ? ' <span class="muted small">(archived)</span>' : ''}${c.ask_description ? ' <span class="muted small">(Shortcut asks a note)</span>' : ''}</span>
        <button type="button" class="icon-btn" data-up="${escapeHtml(c.id)}" aria-label="Move ${escapeHtml(c.name)} up">${icon('up', { size: 18 })}</button>
        <button type="button" class="icon-btn" data-edit="${escapeHtml(c.id)}" aria-label="Edit ${escapeHtml(c.name)}">${icon('edit', { size: 18 })}</button>
      </div>`).join('') || '<p class="empty">No categories yet.</p>'}</div>
    <form id="cat-form" class="field" novalidate>
      <label for="cat-name">New category</label>
      <div style="display:flex;gap:8px"><input id="cat-name" maxlength="60" placeholder="Groceries" autocomplete="off">
        <input type="color" id="cat-color" value="${PALETTE[cats.length % PALETTE.length]}" aria-label="Colour" style="width:56px;flex:none">
        <button type="submit" class="btn btn-primary">Add</button></div>
      <p id="cat-error" class="alert alert-error" role="alert" hidden></p>
    </form>`));
  wireBack(body);
  body.querySelector('#cat-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const name = body.querySelector('#cat-name').value.trim();
    const errorBox = body.querySelector('#cat-error');
    clearError(errorBox);
    if (!name) { showError(errorBox, 'Give the category a name.'); return; }
    if (state.categories.some((c) => c.name.trim().toLowerCase() === name.toLowerCase())) { showError(errorBox, 'There is a category with that name already.'); return; }
    try {
      const created = await db.createCategory({ name, color: body.querySelector('#cat-color').value, sortOrder: nextSortOrder() });
      setState({ categories: [...state.categories, created] });
      toast('Category added');
      openCategories();
    } catch (err) { showError(errorBox, err.message); }
  });
  body.querySelectorAll('[data-edit]').forEach((el) => el.addEventListener('click', () => editCategory(el.dataset.edit)));
  // (moving up one place: the keyboard and screen-reader way to reorder)
  body.querySelectorAll('[data-up]').forEach((el) => el.addEventListener('click', () => {
    const ids = allCategoriesSorted().map((c) => c.id);
    const i = ids.indexOf(el.dataset.up);
    if (i > 0) { [ids[i - 1], ids[i]] = [ids[i], ids[i - 1]]; saveOrder(ids).then(openCategories); }
  }));
  body.querySelector('#cat-list').addEventListener('pointerdown', onPointerDown);
}

function editCategory(id) {
  const cat = state.categories.find((c) => c.id === id);
  if (!cat) return;
  const body = openSheet(`Edit ${cat.name}`, `
    <div class="field"><label for="edit-name">Name</label><input id="edit-name" maxlength="60" value="${escapeHtml(cat.name)}"></div>
    <p class="hint">A per-category Shortcut uses the name: renaming one means changing that Shortcut too.</p>
    <div class="field"><label for="edit-color">Colour</label><input type="color" id="edit-color" value="${safeColor(cat.color)}"></div>
    <label class="check"><input type="checkbox" id="edit-archived" ${cat.archived ? 'checked' : ''}> Archived: not on the log sheet, history kept</label>
    <label class="check"><input type="checkbox" id="edit-ask" ${cat.ask_description ? 'checked' : ''}> The Shortcut asks for a note in this category</label>
    <p id="edit-error" class="alert alert-error" role="alert" hidden></p>
    <div class="btn-row"><button type="button" class="btn btn-danger" data-delete>Delete</button>
      <button type="button" class="btn btn-primary" data-save>Save</button></div>`);
  body.querySelector('[data-save]').addEventListener('click', async (event) => {
    const errorBox = body.querySelector('#edit-error');
    const name = body.querySelector('#edit-name').value.trim();
    clearError(errorBox);
    if (!name) { showError(errorBox, 'Give the category a name.'); return; }
    if (state.categories.some((c) => c.id !== cat.id && c.name.trim().toLowerCase() === name.toLowerCase())) { showError(errorBox, 'There is a category with that name already.'); return; }
    setBusy(event.currentTarget, true);
    try {
      const updated = await db.updateCategory(cat.id, {
        name, color: body.querySelector('#edit-color').value,
        archived: body.querySelector('#edit-archived').checked, askDescription: body.querySelector('#edit-ask').checked,
      });
      setState({ categories: state.categories.map((c) => (c.id === cat.id ? updated : c)) });
      toast('Saved');
      openCategories();
    } catch (err) { showError(errorBox, err.message); setBusy(event.currentTarget, false); }
  });
  body.querySelector('[data-delete]').addEventListener('click', () => deleteCategory(cat));
}

async function deleteCategory(cat) {
  const count = transactionCountByCategory().get(cat.id) || 0;
  if (count) {
    const archive = await confirmSheet({ title: "It can't be deleted", body: `${cat.name} has ${count} expense${count === 1 ? '' : 's'}, so deleting it would break the history. Archive it instead? It leaves the log sheet; the expenses stay.`, confirmLabel: 'Archive', danger: false });
    if (!archive) { openCategories(); return; }
    try {
      const updated = await db.updateCategory(cat.id, { archived: true });
      setState({ categories: state.categories.map((c) => (c.id === cat.id ? updated : c)) });
      toast('Archived');
    } catch (err) { toast(err.message, 'error'); }
    openCategories();
    return;
  }
  if (!await confirmSheet({ title: 'Delete the category?', body: `${cat.name} has no expenses. It's deleted for good.` })) { openCategories(); return; }
  try {
    await db.deleteCategory(cat.id);
    setState({ categories: state.categories.filter((c) => c.id !== cat.id) });
    toast('Deleted');
  } catch (err) { toast(err.message, 'error'); }
  openCategories();
}

/* Dragging by the handle (pointer events: touch and mouse). The listeners are on window, because moving
   the row in the DOM can lose the pointer capture mid-drag. */
let drag = null;

function onPointerDown(event) {
  const handle = event.target.closest('[data-drag-handle]');
  if (!handle || event.button > 0) return;
  const row = handle.closest('.cat-row');
  event.preventDefault();
  drag = { row, list: qs('#cat-list'), pointerId: event.pointerId, originY: event.clientY, moved: false };
  window.addEventListener('pointermove', onPointerMove);
  window.addEventListener('pointerup', onPointerUp);
  window.addEventListener('pointercancel', onPointerUp);
  row.classList.add('is-dragging');
}

function onPointerMove(event) {
  if (!drag || event.pointerId !== drag.pointerId) return;
  const delta = event.clientY - drag.originY;
  if (Math.abs(delta) > 4) drag.moved = true;
  drag.row.style.transform = `translateY(${delta}px)`;
  const mid = drag.row.getBoundingClientRect().top + drag.row.getBoundingClientRect().height / 2;
  for (const sibling of drag.list.querySelectorAll('.cat-row')) {
    if (sibling === drag.row) continue;
    const rect = sibling.getBoundingClientRect();
    const sibMid = rect.top + rect.height / 2;
    const after = Boolean(sibling.compareDocumentPosition(drag.row) & Node.DOCUMENT_POSITION_FOLLOWING);
    const before = Boolean(sibling.compareDocumentPosition(drag.row) & Node.DOCUMENT_POSITION_PRECEDING);
    if (mid < sibMid && after) drag.list.insertBefore(drag.row, sibling);
    else if (mid > sibMid && before) drag.list.insertBefore(drag.row, sibling.nextSibling);
    else continue;
    drag.row.style.transform = '';
    drag.originY = event.clientY;
    break;
  }
}

function onPointerUp(event) {
  if (!drag || (event && event.pointerId !== drag.pointerId)) return;
  const { row, list, moved } = drag;
  drag = null;
  window.removeEventListener('pointermove', onPointerMove);
  window.removeEventListener('pointerup', onPointerUp);
  window.removeEventListener('pointercancel', onPointerUp);
  row.style.transform = '';
  row.classList.remove('is-dragging');
  if (moved) saveOrder([...list.querySelectorAll('.cat-row')].map((el) => el.dataset.catId));
}

/** Only the categories whose place changed are written; the screen changes at once and goes back if it fails. */
async function saveOrder(ids) {
  const updates = [];
  ids.forEach((id, i) => {
    const cat = state.categories.find((c) => c.id === id);
    if (cat && cat.sort_order !== (i + 1) * 10) updates.push({ id, sortOrder: (i + 1) * 10 });
  });
  if (!updates.length) return;
  const previous = state.categories;
  setState({ categories: state.categories.map((c) => { const u = updates.find((x) => x.id === c.id); return u ? { ...c, sort_order: u.sortOrder } : c; }) });
  try {
    await Promise.all(updates.map((u) => db.updateCategory(u.id, { sortOrder: u.sortOrder })));
    toast('Order saved');
  } catch (err) {
    setState({ categories: previous });
    toast(err.message, 'error');
  }
}

/* ---------- Budgets ---------- */

/* The budgets: one for the whole month (every month, and a month of its own where it differs), and the
   categories' budgets inside it, every month or one month. The month at the top picks which month the
   month-only budgets are for (Alex, 10 Nov 2026: "one budget that goes for every month, and change it for a
   specific month"). */
let budgetMonth = null;

function openBudgets(month = budgetMonth || state.month) {
  budgetMonth = month;
  const cats = allCategoriesSorted().filter((c) => !c.archived);
  const monthly = monthlyBudgetFor(month);
  const every = state.monthlyBudgets.find((b) => !b.year_month) || null;
  const own = state.monthlyBudgets.find((b) => b.year_month === month) || null;
  const catsTotal = cats.reduce((sum, c) => { const r = budgetRowFor(c.id, month).row; return sum + (r ? r.amount_cents : 0); }, 0);
  const name = monthName(month);
  let fits = '';
  if (monthly.row) {
    fits = catsTotal > monthly.row.amount_cents
      ? `<p class="alert alert-info">The categories' budgets add up to ${escapeHtml(formatMoney(catsTotal))}, ${escapeHtml(formatMoney(catsTotal - monthly.row.amount_cents))} more than the month's budget.</p>`
      : `<p class="hint">The categories' budgets add up to ${escapeHtml(formatMoney(catsTotal))}; ${escapeHtml(formatMoney(monthly.row.amount_cents - catsTotal))} of the month's budget isn't given to a category.</p>`;
  }
  const whole = state.hasMonthly ? `
    <div class="rows">
      <button type="button" class="row" data-monthly="every"><span class="dot" style="background:var(--amber)"></span>
        <span class="row-name">Every month</span>
        <span class="row-amount">${every ? escapeHtml(formatMoney(every.amount_cents)) : '<small>not set</small>'}</span>
        <span class="row-sub">${every ? 'the budget for everything you spend in a month' : 'set one budget for everything, every month'}</span></button>
      <button type="button" class="row" data-monthly="month"><span class="dot" style="background:${own ? 'var(--amber)' : 'var(--line)'}"></span>
        <span class="row-name">${escapeHtml(name)} only</span>
        <span class="row-amount">${own ? escapeHtml(formatMoney(own.amount_cents)) : '<small>as every month</small>'}</span>
        <span class="row-sub">${own ? `${escapeHtml(name)}'s own budget, instead of every month's` : `a different budget for ${escapeHtml(name)}`}</span></button>
    </div>${fits}`
    : "<p class=\"alert alert-info\">The month's own budget needs a small database update: paste <code>sql/build1b.sql</code> into Supabase's SQL Editor.</p>";
  const body = openSheet('Budgets', back(`
    <div class="month-nav sheet-month" aria-label="Month">
      <button type="button" class="icon-btn" data-m="-1" aria-label="Previous month">${icon('prev')}</button>
      <span class="month-label">${escapeHtml(monthLabel(month))}</span>
      <button type="button" class="icon-btn" data-m="1" aria-label="Next month">${icon('next')}</button>
    </div>
    <h3 class="section-title">The whole month</h3>
    ${whole}
    <h3 class="section-title">Categories, ${escapeHtml(name)}</h3>
    <div class="rows">${cats.map((c) => {
      const { row, kind } = budgetRowFor(c.id, month);
      const sub = kind === 'month' ? `${escapeHtml(name)} only` : kind === 'default' ? 'every month' : 'no budget';
      return `<button type="button" class="row" data-budget="${escapeHtml(c.id)}"><span class="dot" style="background:${safeColor(c.color)}"></span>
        <span class="row-name">${escapeHtml(c.name)}</span>
        <span class="row-amount">${row ? escapeHtml(formatMoney(row.amount_cents)) : '<small>none</small>'}</span>
        <span class="row-sub">${sub}</span></button>`;
    }).join('')}</div>`));
  wireBack(body);
  body.querySelectorAll('[data-m]').forEach((el) => el.addEventListener('click', () => openBudgets(addMonths(month, Number(el.dataset.m)))));
  body.querySelectorAll('[data-budget]').forEach((el) => el.addEventListener('click', () => openBudget(el.dataset.budget, month, () => openBudgets(month))));
  body.querySelectorAll('[data-monthly]').forEach((el) => el.addEventListener('click', () => editMonthly(el.dataset.monthly === 'every' ? null : month)));
}

/** The budget for everything: every month (yearMonth null) or one month's own. */
function editMonthly(yearMonth) {
  const month = budgetMonth || state.month;
  const row = state.monthlyBudgets.find((b) => (b.year_month || null) === yearMonth) || null;
  const title = yearMonth ? `${monthName(yearMonth)}'s budget` : 'Every month';
  const text = yearMonth
    ? `A budget for everything in ${escapeHtml(monthLabel(yearMonth))}, instead of every month's. The other months keep every month's.`
    : "One budget for everything you spend in a month. The month shows what's spent against it, and any month can have its own.";
  const body = openSheet(title, `
    <p class="sheet-text">${text}</p>
    <div class="field"><label for="mb-amount">Euros</label>
      <input id="mb-amount" inputmode="decimal" autocomplete="off" value="${row ? escapeHtml(formatAmount(row.amount_cents)) : ''}" placeholder="900"></div>
    <p id="mb-error" class="alert alert-error" role="alert" hidden></p>
    <div class="btn-row">${row ? '<button type="button" class="btn btn-danger" data-remove>Remove</button>' : ''}
      <button type="button" class="btn btn-quiet" data-cancel>Back</button><button type="button" class="btn btn-primary" data-save>Save</button></div>`,
  { focus: '#mb-amount' });
  body.querySelector('[data-cancel]').addEventListener('click', () => openBudgets(month));
  body.querySelector('[data-save]').addEventListener('click', async (event) => {
    const errorBox = body.querySelector('#mb-error');
    clearError(errorBox);
    const cents = parseAmountToCents(body.querySelector('#mb-amount').value);
    if (cents === null) { showError(errorBox, 'Write the budget in euros, like 900.'); return; }
    setBusy(event.currentTarget, true);
    try {
      const saved = await db.saveMonthlyBudget({ id: row ? row.id : null, yearMonth, amountCents: cents });
      setState({ monthlyBudgets: row ? state.monthlyBudgets.map((b) => (b.id === saved.id ? saved : b)) : [...state.monthlyBudgets, saved] });
      toast('Budget saved');
      openBudgets(month);
    } catch (err) { showError(errorBox, err.message); setBusy(event.currentTarget, false); }
  });
  const remove = body.querySelector('[data-remove]');
  if (remove) remove.addEventListener('click', async () => {
    try {
      await db.deleteMonthlyBudget(row.id);
      setState({ monthlyBudgets: state.monthlyBudgets.filter((b) => b.id !== row.id) });
      toast(yearMonth ? `${monthName(yearMonth)} follows every month's budget again` : 'Removed');
    } catch (err) { toast(err.message, 'error'); }
    openBudgets(month);
  });
}

/* ---------- Income: paydays (known income on a day each month) and income that came ---------- */

export function openIncome() {
  if (!state.hasBuild1) {
    const body = openSheet('Income', back('<p class="alert alert-info">Income needs the database update: paste <code>sql/build1.sql</code> into Supabase\'s SQL Editor.</p>'));
    wireBack(body);
    return;
  }
  const month = incomeFor(state.month);
  const body = openSheet('Income', back(`
    <div class="section-head"><h3 class="section-title">Paydays</h3><button type="button" class="link-btn" data-new-payday>Add a payday</button></div>
    <p class="hint">Income that comes on a day each month: a study grant, a salary. It's counted on its day, without typing it in each month.</p>
    <div class="rows">${state.paydays.map((p) => `
      <button type="button" class="row" data-payday="${escapeHtml(p.id)}"><span class="dot" style="background:var(--amber)"></span>
        <span class="row-name">${escapeHtml(p.name)}</span><span class="row-amount">${escapeHtml(formatMoney(p.amount_cents))}</span>
        <span class="row-sub">the ${ordinal(p.day_of_month)} of each month${p.ends_on ? `, until ${escapeHtml(formatDate(p.ends_on))}` : ''}</span></button>`).join('') || '<p class="empty">None yet.</p>'}</div>
    <div class="section-head"><h3 class="section-title">${escapeHtml(monthName(state.month))}</h3><button type="button" class="link-btn" data-new-income>Add income</button></div>
    <div class="rows">${month.rows.map((r) => `
      <button type="button" class="row" ${r.id ? `data-income="${escapeHtml(r.id)}"` : `data-payday-actual="${escapeHtml(r.paydayId)}"`}>
        <span class="dot" style="background:${r.expected ? 'var(--line)' : 'var(--amber)'}"></span>
        <span class="row-name">${escapeHtml(r.source)}</span><span class="row-amount">${escapeHtml(formatMoney(r.cents))}</span>
        <span class="row-sub">${escapeHtml(formatDay(r.on))}${r.fromPayday ? (r.expected ? ' · expected' : ' · payday (tap if the amount differed)') : ''}</span></button>`).join('') || '<p class="empty">No income this month.</p>'}</div>`));
  wireBack(body);
  body.querySelector('[data-new-payday]').addEventListener('click', () => editPayday(null));
  body.querySelector('[data-new-income]').addEventListener('click', () => editIncome(null));
  body.querySelectorAll('[data-payday]').forEach((el) => el.addEventListener('click', () => editPayday(el.dataset.payday)));
  body.querySelectorAll('[data-income]').forEach((el) => el.addEventListener('click', () => editIncome(el.dataset.income)));
  body.querySelectorAll('[data-payday-actual]').forEach((el) => el.addEventListener('click', () => editIncome(null, el.dataset.paydayActual)));
}

function editPayday(id) {
  const p = state.paydays.find((x) => x.id === id) || null;
  const body = openSheet(p ? p.name : 'New payday', `
    <div class="field"><label for="pd-name">What</label><input id="pd-name" maxlength="60" value="${escapeHtml(p ? p.name : '')}" placeholder="Study grant"></div>
    <div class="field"><label for="pd-amount">Amount, €</label><input id="pd-amount" inputmode="decimal" value="${p ? escapeHtml(formatAmount(p.amount_cents)) : ''}"></div>
    <div class="field"><label for="pd-day">Day of the month</label><input id="pd-day" type="number" min="1" max="31" inputmode="numeric" value="${p ? p.day_of_month : ''}"></div>
    <div class="field"><label for="pd-end">Last one (optional)</label><input id="pd-end" type="date" value="${p && p.ends_on ? escapeHtml(p.ends_on) : ''}"></div>
    <p id="pd-error" class="alert alert-error" role="alert" hidden></p>
    <div class="btn-row">${p ? '<button type="button" class="btn btn-danger" data-delete>Delete</button>' : ''}<button type="button" class="btn btn-primary" data-save>Save</button></div>`,
  { focus: p ? null : '#pd-name' });
  body.querySelector('[data-save]').addEventListener('click', async (event) => {
    const errorBox = body.querySelector('#pd-error');
    clearError(errorBox);
    const name = body.querySelector('#pd-name').value.trim();
    const cents = parseAmountToCents(body.querySelector('#pd-amount').value);
    const day = Number(body.querySelector('#pd-day').value);
    const end = body.querySelector('#pd-end').value || null;
    if (!name) { showError(errorBox, 'Say what it is.'); return; }
    if (cents === null) { showError(errorBox, 'Write the amount in euros.'); return; }
    if (!(day >= 1 && day <= 31)) { showError(errorBox, 'The day is 1 to 31.'); return; }
    setBusy(event.currentTarget, true);
    try {
      const saved = await db.savePayday({ id: p ? p.id : null, name, amountCents: cents, dayOfMonth: day, startsOn: p ? p.starts_on : `${state.month}-01`, endsOn: end && isValidISODate(end) ? end : null });
      setState({ paydays: p ? state.paydays.map((x) => (x.id === saved.id ? saved : x)) : [...state.paydays, saved] });
      toast('Payday saved');
      openIncome();
    } catch (err) { showError(errorBox, err.message); setBusy(event.currentTarget, false); }
  });
  const del = body.querySelector('[data-delete]');
  if (del) del.addEventListener('click', async () => {
    if (!await confirmSheet({ title: `Delete ${p.name}?`, body: 'It stops counting from now. Income already typed in stays.' })) { openIncome(); return; }
    try { await db.deletePayday(p.id); setState({ paydays: state.paydays.filter((x) => x.id !== p.id) }); toast('Deleted'); } catch (err) { toast(err.message, 'error'); }
    openIncome();
  });
}

function editIncome(id, paydayId = null) {
  const i = state.income.find((x) => x.id === id) || null;
  const payday = state.paydays.find((x) => x.id === (i ? i.payday_id : paydayId)) || null;
  const day = i ? i.received_on : payday ? `${state.month}-${String(Math.min(payday.day_of_month, 28)).padStart(2, '0')}` : todayISO();
  const body = openSheet(i ? 'Income' : payday ? `${payday.name}, this month` : 'Income that came', `
    <div class="field"><label for="in-source">From</label><input id="in-source" maxlength="60" value="${escapeHtml(i ? i.source : payday ? payday.name : '')}" placeholder="Salary, a gift, Kela"></div>
    <div class="field"><label for="in-amount">Amount, €</label><input id="in-amount" inputmode="decimal" value="${i ? escapeHtml(formatAmount(i.amount_cents)) : payday ? escapeHtml(formatAmount(payday.amount_cents)) : ''}"></div>
    <div class="field"><label for="in-date">Day</label><input id="in-date" type="date" value="${escapeHtml(day)}"></div>
    <div class="field"><label for="in-note">Note</label><input id="in-note" maxlength="300" value="${escapeHtml(i && i.note ? i.note : '')}"></div>
    <p id="in-error" class="alert alert-error" role="alert" hidden></p>
    <div class="btn-row">${i ? '<button type="button" class="btn btn-danger" data-delete>Delete</button>' : ''}<button type="button" class="btn btn-primary" data-save>Save</button></div>`,
  { focus: i ? null : '#in-amount' });
  body.querySelector('[data-save]').addEventListener('click', async (event) => {
    const errorBox = body.querySelector('#in-error');
    clearError(errorBox);
    const source = body.querySelector('#in-source').value.trim();
    const cents = parseAmountToCents(body.querySelector('#in-amount').value);
    const received = body.querySelector('#in-date').value;
    if (!source) { showError(errorBox, 'Say where it came from.'); return; }
    if (cents === null) { showError(errorBox, 'Write the amount in euros.'); return; }
    if (!isValidISODate(received)) { showError(errorBox, 'Pick the day.'); return; }
    setBusy(event.currentTarget, true);
    try {
      const saved = await db.saveIncome({ id: i ? i.id : null, amountCents: cents, receivedOn: received, source, note: body.querySelector('#in-note').value, paydayId: i ? i.payday_id : paydayId });
      setState({ income: i ? state.income.map((x) => (x.id === saved.id ? saved : x)) : [saved, ...state.income] });
      toast('Income saved');
      openIncome();
    } catch (err) { showError(errorBox, err.message); setBusy(event.currentTarget, false); }
  });
  const del = body.querySelector('[data-delete]');
  if (del) del.addEventListener('click', async () => {
    try { await db.deleteIncome(i.id); setState({ income: state.income.filter((x) => x.id !== i.id) }); toast('Deleted'); } catch (err) { toast(err.message, 'error'); }
    openIncome();
  });
}

/* ---------- Connections: device tokens for the Shortcut and Otso (F7: what they can do, said truly) ---------- */

function generateToken() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function sha256Hex(text) {
  const buffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buffer)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

function openConnections() {
  const tokens = state.deviceTokens;
  const body = openSheet('Connections', back(`
    <p class="sheet-text">A token lets something log expenses without signing in: the iPhone Shortcut, or Otso. What each can do:</p>
    <ul class="sheet-text" style="margin:0;padding-left:20px">
      <li>Every token can log an expense, and take back what it logged itself within 7 days.</li>
      <li><b>Can read</b>: it can also read all your expenses and budgets.</li>
      <li><b>Otso's notes</b>: it can also post notes on the Otso tab. Only Otso's token needs it.</li>
    </ul>
    <div>${tokens.map((t) => `
      <div class="token" data-token="${escapeHtml(t.id)}">
        <div class="token-head"><input value="${escapeHtml(t.name)}" maxlength="60" aria-label="Name" data-name>
          <button type="button" class="icon-btn" data-remove aria-label="Delete ${escapeHtml(t.name)}">${icon('trash', { size: 18 })}</button></div>
        <label class="check"><input type="checkbox" data-read ${t.can_read ? 'checked' : ''}> Can read</label>
        ${'can_note' in t ? `<label class="check"><input type="checkbox" data-note ${t.can_note ? 'checked' : ''}> Otso's notes</label>` : ''}
        <span class="muted small">Made ${escapeHtml(formatDate(t.created_at.slice(0, 10)))} · ${t.last_used_at ? `last used ${escapeHtml(formatDate(t.last_used_at.slice(0, 10)))}` : 'not used yet'}</span>
      </div>`).join('') || '<p class="empty">No tokens yet.</p>'}</div>
    <div class="field"><label for="new-token">New token</label>
      <div style="display:flex;gap:8px"><input id="new-token" maxlength="60" placeholder="iPhone" autocomplete="off"><button type="button" class="btn btn-primary" data-create>Make</button></div>
      <label class="check"><input type="checkbox" id="new-read"> Can read</label></div>
    <p id="token-error" class="alert alert-error" role="alert" hidden></p>
    <p class="hint">Setting up the Shortcut: <a href="${SHORTCUT_HELP}" target="_blank" rel="noopener">the guide</a>.</p>`));
  wireBack(body);

  body.querySelectorAll('[data-token]').forEach((row) => {
    const id = row.dataset.token;
    const save = async (patch, what) => {
      try {
        const updated = await db.updateDeviceToken(id, patch);
        setState({ deviceTokens: state.deviceTokens.map((t) => (t.id === id ? { ...t, ...updated } : t)) });
        toast(what);
      } catch (err) { toast(err.message, 'error'); openConnections(); }
    };
    row.querySelector('[data-name]').addEventListener('change', (e) => save({ name: e.target.value }, 'Renamed'));
    row.querySelector('[data-read]').addEventListener('change', (e) => save({ canRead: e.target.checked }, e.target.checked ? 'It can read now' : 'It can only log now'));
    const note = row.querySelector('[data-note]');
    if (note) note.addEventListener('change', (e) => save({ canNote: e.target.checked }, e.target.checked ? "It can post Otso's notes" : "It can't post notes now"));
    row.querySelector('[data-remove]').addEventListener('click', async () => {
      const token = state.deviceTokens.find((t) => t.id === id);
      if (!await confirmSheet({ title: `Delete ${token.name}?`, body: 'Whatever uses it stops working at once. Its expenses stay.' })) { openConnections(); return; }
      try { await db.deleteDeviceToken(id); setState({ deviceTokens: state.deviceTokens.filter((t) => t.id !== id) }); toast('Deleted'); } catch (err) { toast(err.message, 'error'); }
      openConnections();
    });
  });
  body.querySelector('[data-create]').addEventListener('click', async (event) => {
    const errorBox = body.querySelector('#token-error');
    clearError(errorBox);
    const name = body.querySelector('#new-token').value.trim() || 'iPhone';
    const token = generateToken();
    setBusy(event.currentTarget, true, 'Making…');
    try {
      const created = await db.createDeviceToken({ name, tokenHash: await sha256Hex(token), canRead: body.querySelector('#new-read').checked });
      setState({ deviceTokens: [created, ...state.deviceTokens] });
      showTokenOnce(token, name);
    } catch (err) { showError(errorBox, err.message); setBusy(event.currentTarget, false); }
  });
}

function showTokenOnce(token, name) {
  const body = openSheet('Token made', `
    <p class="sheet-text">This is shown <b>once</b>. Copy it into the Shortcut (or Otso's <code>KULUT_TOKEN</code>) now: only its fingerprint was saved, so it can't be looked up later. A lost one is replaced with a new one.</p>
    <div class="token-value" id="token-value">${escapeHtml(token)}</div>
    <button type="button" class="btn btn-primary btn-block" data-copy>Copy</button>
    <p class="hint" id="copy-status" aria-live="polite"></p>
    <div class="btn-row"><button type="button" class="btn btn-quiet" data-done>Done</button></div>`);
  body.querySelector('[data-copy]').addEventListener('click', async () => {
    const status = body.querySelector('#copy-status');
    try { await navigator.clipboard.writeText(token); status.textContent = `Copied (${name}).`; } catch {
      const range = document.createRange();
      range.selectNodeContents(body.querySelector('#token-value'));
      window.getSelection().removeAllRanges();
      window.getSelection().addRange(range);
      status.textContent = "It couldn't be copied automatically: the text is selected.";
    }
  });
  body.querySelector('[data-done]').addEventListener('click', () => openConnections());
}

/* ---------- Data and Account ---------- */

function openData() {
  const body = openSheet('Data', back(`
    <p class="sheet-text">Excel: every expense, each month by category with its budget, and each month's total (for analysis, not for restoring).</p>
    <button type="button" class="btn btn-quiet btn-block" data-excel>Export to Excel</button>
    <p class="sheet-text">Backup: categories, expenses, budgets, income and paydays as one file. Restoring adds what's in it and deletes nothing (restoring the same file twice adds its expenses twice).</p>
    <div class="btn-row"><button type="button" class="btn btn-quiet" data-backup>Save a backup</button>
      <label class="btn btn-quiet" for="restore-file" style="cursor:pointer">Restore a backup</label></div>
    <input type="file" id="restore-file" accept="application/json,.json" hidden>`));
  wireBack(body);
  body.querySelector('[data-excel]').addEventListener('click', (e) => exportExcel(e.currentTarget));
  body.querySelector('[data-backup]').addEventListener('click', () => exportBackup());
  body.querySelector('#restore-file').addEventListener('change', async (e) => {
    const file = e.target.files && e.target.files[0];
    if (file) { await importBackupFile(file); await reloadData(); }
  });
}

function openAccount() {
  const body = openSheet('Account', back(`
    <p class="sheet-text">Signed in as <b>${escapeHtml(state.user ? state.user.email : '')}</b>.</p>
    <button type="button" class="btn btn-quiet btn-block" data-signout>Sign out</button>
    <p class="hint">Otso - Expenses ${escapeHtml(APP_VERSION)}</p>`));
  wireBack(body);
  body.querySelector('[data-signout]').addEventListener('click', () => signOut());
}
