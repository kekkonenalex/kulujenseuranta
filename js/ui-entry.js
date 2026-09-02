// ============================================================
//  KIRJAA-nakyma: kulun kirjaus mahdollisimman vahalla kosketuksella.
//  Summa -> kategoria pudotusvalikosta -> Tallenna.
//  Paivamaara on esitaytetty, ja valittu kategoria jaa voimaan
//  tallennuksen jalkeen, joten perakkaiset kirjaukset samaan
//  kategoriaan eivat vaadi valikon avaamista uudelleen.
// ============================================================

import * as db from './db.js';
import { state, setState, activeCategories, categoryById } from './state.js';
import {
  parseAmountToCents, todayISO, addDaysISO, isValidISODate, formatMoney,
} from './format.js';
import { qs, show, showError, clearError, setBusy, toast, escapeHtml } from './ui-common.js';

const PLACEHOLDER = 'Valitse kategoria…';

/** Valitun kategorian vari pallona valikon vasemmassa reunassa. */
function renderSelectedColor() {
  const dot = qs('#entry-category-dot');
  const cat = categoryById(qs('#entry-category').value);
  dot.style.background = cat ? cat.color : 'var(--line)';
}

function renderCategories() {
  const select = qs('#entry-category');
  const categories = activeCategories();
  const previous = select.value;

  show(qs('#entry-no-categories'), categories.length === 0);
  show(qs('#entry-category-field'), categories.length > 0);

  select.innerHTML = [
    `<option value="">${escapeHtml(PLACEHOLDER)}</option>`,
    ...categories.map((cat) => `
      <option value="${escapeHtml(cat.id)}">${escapeHtml(cat.name)}</option>`),
  ].join('');

  // Valinta sailyy uudelleenpiirron yli, jos kategoria on edelleen olemassa.
  select.value = categories.some((cat) => cat.id === previous) ? previous : '';
  renderSelectedColor();
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
  const categoryId = qs('#entry-category').value;
  const occurredOn = qs('#entry-date').value;
  const description = qs('#entry-description').value.trim();

  if (amountCents === null) {
    showError(errorBox, 'Anna summa muodossa 12,50.');
    qs('#entry-amount').focus();
    return;
  }
  if (!categoryId) {
    showError(errorBox, 'Valitse kategoria.');
    qs('#entry-category').focus();
    return;
  }
  if (!isValidISODate(occurredOn)) {
    showError(errorBox, 'Tarkista päivämäärä.');
    return;
  }

  setBusy(submit, true);
  try {
    const created = await db.createTransaction({
      categoryId,
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

  qs('#entry-category').addEventListener('change', () => {
    renderSelectedColor();
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
