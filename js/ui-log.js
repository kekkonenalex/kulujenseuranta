// ============================================================
//  Logging an expense (L1): one sheet. Type the amount, choose the category from the list, Save. The day
//  and a note are optional. Nothing is guessed: the list starts on "Choose a category" (L2 was turned
//  down: a silently wrong category is worse than one more tap). A saved one can be undone from the toast.
// ============================================================

import * as db from './db.js';
import { state, setState, activeCategories } from './state.js';
import { parseAmountToCents, todayISO, addDaysISO, isValidISODate, formatMoney, formatDay } from './format.js';
import { openSheet, closeSheet, toast, showError, clearError, setBusy, categorySelect } from './ui-common.js';

export function openLog() {
  const cats = activeCategories();
  if (!cats.length) {
    openSheet('Log an expense', '<p class="sheet-text">Add a category first: Settings, Categories.</p>');
    return;
  }
  const today = todayISO();
  const body = openSheet('Log an expense', `
    <form id="log-form" class="stack" novalidate>
      <label for="log-amount" class="label">Amount, €</label>
      <input id="log-amount" class="amount-input num" inputmode="decimal" autocomplete="off" placeholder="0,00">
      <div class="field"><label for="log-cat">Category</label>${categorySelect('log-cat', cats)}</div>
      <div class="word-tabs" role="group" aria-label="Day">
        <button type="button" class="word-tab" data-day="${today}" aria-pressed="true">Today</button>
        <button type="button" class="word-tab" data-day="${addDaysISO(today, -1)}" aria-pressed="false">Yesterday</button>
        <button type="button" class="word-tab" data-day="pick" aria-pressed="false">Another day</button>
      </div>
      <input type="date" id="log-date" value="${today}" aria-label="The day" hidden>
      <div class="field"><label for="log-note">Note</label><input id="log-note" maxlength="300" placeholder="Prisma, lunch with Venny…" autocomplete="off"></div>
      <p id="log-error" class="alert alert-error" role="alert" hidden></p>
      <button type="submit" class="btn btn-primary btn-block" data-save>Save</button>
    </form>`, { focus: '#log-amount' });

  const amount = body.querySelector('#log-amount');
  const category = body.querySelector('#log-cat');
  const dateInput = body.querySelector('#log-date');
  let day = today;
  amount.addEventListener('input', () => { amount.value = amount.value.replace(/[^\d,.\s]/g, ''); });
  body.querySelectorAll('[data-day]').forEach((chip) => chip.addEventListener('click', () => {
    body.querySelectorAll('[data-day]').forEach((c) => c.setAttribute('aria-pressed', String(c === chip)));
    if (chip.dataset.day === 'pick') {
      dateInput.hidden = false;
      dateInput.focus();
      if (typeof dateInput.showPicker === 'function') { try { dateInput.showPicker(); } catch { /* not allowed here */ } }
    } else {
      dateInput.hidden = true;
      day = chip.dataset.day;
    }
  }));
  dateInput.addEventListener('change', () => { if (isValidISODate(dateInput.value)) day = dateInput.value; });
  category.addEventListener('change', () => clearError(body.querySelector('#log-error')));

  let saving = false;
  body.querySelector('#log-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    if (saving) return;
    const errorBox = body.querySelector('#log-error');
    const button = body.querySelector('[data-save]');
    clearError(errorBox);
    const cents = parseAmountToCents(amount.value);
    if (cents === null) {
      showError(errorBox, 'First the amount, like 12,40.');
      amount.focus();
      return;
    }
    if (!category.value) {
      showError(errorBox, 'Choose the category.');
      category.focus();
      return;
    }
    saving = true;
    setBusy(button, true);
    try {
      const created = await db.createTransaction({
        categoryId: category.value, amountCents: cents, occurredOn: day, description: body.querySelector('#log-note').value,
      });
      setState({ transactions: [created, ...state.transactions] });
      closeSheet();
      const name = category.options[category.selectedIndex].textContent.trim();
      toast(`Saved ${formatMoney(cents)} to ${name}${day !== today ? `, ${formatDay(day)}` : ''}`, 'ok', {
        label: 'Undo',
        run: async () => {
          try {
            await db.deleteTransaction(created.id);
            setState({ transactions: state.transactions.filter((t) => t.id !== created.id) });
            toast('Taken back');
          } catch (err) { toast(err.message, 'error'); }
        },
      });
    } catch (err) {
      saving = false;
      setBusy(button, false);
      showError(errorBox, err.message);
    }
  });
}
