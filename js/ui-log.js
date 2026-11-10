// ============================================================
//  Logging an expense (L1): one sheet. Type the amount, tap the category: that saves it. Two taps and
//  the digits. The day and a note are optional, before the category. Nothing is guessed: no category is
//  picked in advance (L2 was turned down: a silently wrong category is worse than one more tap). A saved
//  one can be undone from the toast.
// ============================================================

import * as db from './db.js';
import { state, setState, activeCategories } from './state.js';
import { parseAmountToCents, todayISO, addDaysISO, isValidISODate, formatMoney, formatDay } from './format.js';
import { escapeHtml, safeColor, openSheet, closeSheet, toast, showError, clearError } from './ui-common.js';

export function openLog() {
  const cats = activeCategories();
  if (!cats.length) {
    openSheet('Log an expense', '<p class="sheet-text">Add a category first: Settings, Categories.</p>');
    return;
  }
  const today = todayISO();
  const body = openSheet('Log an expense', `
    <label for="log-amount" class="label">Amount, €</label>
    <input id="log-amount" class="amount-input num" inputmode="decimal" autocomplete="off" placeholder="0,00" aria-describedby="log-hint">
    <p class="hint" id="log-hint">Add a note if you like, then tap the category: that saves it.</p>
    <div class="word-tabs" role="group" aria-label="Day">
      <button type="button" class="word-tab" data-day="${today}" aria-pressed="true">Today</button>
      <button type="button" class="word-tab" data-day="${addDaysISO(today, -1)}" aria-pressed="false">Yesterday</button>
      <button type="button" class="word-tab" data-day="pick" aria-pressed="false">Another day</button>
    </div>
    <input type="date" id="log-date" value="${today}" aria-label="The day" hidden>
    <div class="field"><label for="log-note">Note</label><input id="log-note" maxlength="300" placeholder="Prisma, lunch with Venny…" autocomplete="off"></div>
    <div class="pick-list" role="group" aria-label="Category, saves">${cats.map((c) => `
      <button type="button" class="pick go" data-cat="${escapeHtml(c.id)}"><span class="dot" style="background:${safeColor(c.color)}"></span><span>${escapeHtml(c.name)}</span></button>`).join('')}</div>
    <p id="log-error" class="alert alert-error" role="alert" hidden></p>`, { focus: '#log-amount' });

  const amount = body.querySelector('#log-amount');
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

  let saving = false;
  body.querySelectorAll('[data-cat]').forEach((chip) => chip.addEventListener('click', async () => {
    if (saving) return;
    const errorBox = body.querySelector('#log-error');
    clearError(errorBox);
    const cents = parseAmountToCents(amount.value);
    if (cents === null) {
      showError(errorBox, 'First the amount, like 12,40.');
      amount.focus();
      return;
    }
    saving = true;
    chip.setAttribute('aria-pressed', 'true');
    try {
      const created = await db.createTransaction({
        categoryId: chip.dataset.cat, amountCents: cents, occurredOn: day, description: body.querySelector('#log-note').value,
      });
      setState({ transactions: [created, ...state.transactions] });
      closeSheet();
      const name = chip.textContent.trim();
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
      chip.setAttribute('aria-pressed', 'false');
      showError(errorBox, err.message);
    }
  }));
}
