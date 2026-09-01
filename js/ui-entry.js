// ============================================================
//  KIRJAA-nakyma: kulun kirjaus mahdollisimman vahalla kosketuksella.
//  Summa -> kategoria -> Tallenna. Paivamaara on esitaytetty.
// ============================================================

import * as db from './db.js';
import { state, setState, activeCategories } from './state.js';
import {
  parseAmountToCents, todayISO, addDaysISO, isValidISODate, formatMoney,
} from './format.js';
import { qs, show, showError, clearError, setBusy, toast, escapeHtml } from './ui-common.js';

let selectedCategoryId = null;

function renderCategories() {
  const grid = qs('#entry-categories');
  const categories = activeCategories();

  show(qs('#entry-no-categories'), categories.length === 0);
  show(grid, categories.length > 0);

  if (selectedCategoryId && !categories.some((c) => c.id === selectedCategoryId)) {
    selectedCategoryId = null;
  }

  grid.innerHTML = categories.map((cat) => `
    <button type="button" class="cat-btn${cat.id === selectedCategoryId ? ' is-selected' : ''}"
            data-category-id="${escapeHtml(cat.id)}" aria-pressed="${cat.id === selectedCategoryId}">
      <span class="dot" style="background:${escapeHtml(cat.color)}"></span>
      <span class="cat-name">${escapeHtml(cat.name)}</span>
    </button>
  `).join('');
}

function renderDateChips() {
  const value = qs('#entry-date').value;
  qs('#entry-today').classList.toggle('is-active', value === todayISO());
  qs('#entry-yesterday').classList.toggle('is-active', value === addDaysISO(todayISO(), -1));
}

function setDate(iso) {
  qs('#entry-date').value = iso;
  renderDateChips();
}

async function handleSubmit(event) {
  event.preventDefault();
  const errorBox = qs('#entry-error');
  const submit = qs('#entry-submit');
  clearError(errorBox);

  const amountCents = parseAmountToCents(qs('#entry-amount').value);
  const occurredOn = qs('#entry-date').value;
  const description = qs('#entry-description').value.trim();

  if (amountCents === null) {
    showError(errorBox, 'Anna summa muodossa 12,50.');
    qs('#entry-amount').focus();
    return;
  }
  if (!selectedCategoryId) {
    showError(errorBox, 'Valitse kategoria.');
    return;
  }
  if (!isValidISODate(occurredOn)) {
    showError(errorBox, 'Tarkista päivämäärä.');
    return;
  }

  setBusy(submit, true);
  try {
    const created = await db.createTransaction({
      categoryId: selectedCategoryId,
      amountCents,
      occurredOn,
      description,
    });

    setState({ transactions: [created, ...state.transactions] });

    // Tyhjennetaan summa ja kuvaus; kategoria jaa valituksi, koska
    // perakkaiset kirjaukset ovat usein samasta kategoriasta.
    // Paivamaara palautetaan tahan paivaan: jos menneelle paivalle
    // kirjattu paiva jaisi voimaan, seuraava kulu menisi hiljaisesti
    // vaaralle kuukaudelle.
    qs('#entry-amount').value = '';
    qs('#entry-description').value = '';
    setDate(todayISO());
    toast(`Kirjattu ${formatMoney(amountCents)}`, 'ok');
    qs('#entry-amount').focus();
  } catch (err) {
    showError(errorBox, err.message);
  } finally {
    setBusy(submit, false);
  }
}

export function initEntryView() {
  setDate(todayISO());

  qs('#entry-categories').addEventListener('click', (event) => {
    const button = event.target.closest('[data-category-id]');
    if (!button) return;
    selectedCategoryId = button.dataset.categoryId === selectedCategoryId
      ? null
      : button.dataset.categoryId;
    renderCategories();
    clearError(qs('#entry-error'));
  });

  qs('#entry-today').addEventListener('click', () => setDate(todayISO()));
  qs('#entry-yesterday').addEventListener('click', () => setDate(addDaysISO(todayISO(), -1)));
  qs('#entry-date').addEventListener('change', renderDateChips);
  qs('#entry-form').addEventListener('submit', handleSubmit);

  // Summakentassa sallitaan vain numerot, pilkku ja piste.
  qs('#entry-amount').addEventListener('input', (event) => {
    const cleaned = event.target.value.replace(/[^\d.,]/g, '');
    if (cleaned !== event.target.value) event.target.value = cleaned;
  });
}

export function renderEntryView() {
  renderCategories();
  renderDateChips();
}

/** Uusi paiva -> paivita esitaytetty paivamaara kun sovellus palaa esiin. */
export function refreshEntryDateIfStale() {
  const input = qs('#entry-date');
  if (input && input.value && input.value < todayISO()) setDate(todayISO());
}
