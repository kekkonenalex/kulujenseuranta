// ============================================================
//  ASETUKSET: kategorioiden luonti, muokkaus, arkistointi, poisto.
// ============================================================

import * as db from './db.js';
import {
  state, setState, allCategoriesSorted, nextSortOrder, transactionCountByCategory,
} from './state.js';
import {
  qs, show, showError, clearError, setBusy, toast, escapeHtml, openModal, closeModal, confirmModal,
} from './ui-common.js';

function renderList() {
  const list = qs('#cat-list');
  const categories = allCategoriesSorted();
  const counts = transactionCountByCategory();

  show(qs('#cat-empty'), categories.length === 0);

  list.innerHTML = categories.map((cat) => {
    const count = counts.get(cat.id) || 0;
    return `
      <div class="cat-row">
        <span class="dot" style="background:${escapeHtml(cat.color)}"></span>
        <span class="cat-row-name">${escapeHtml(cat.name)}${cat.archived ? ' <span class="muted small">(arkistoitu)</span>' : ''}</span>
        <span class="cat-row-count">${count} kirjausta</span>
        <button type="button" class="icon-btn" data-edit="${escapeHtml(cat.id)}" aria-label="Muokkaa kategoriaa ${escapeHtml(cat.name)}">✎</button>
        <button type="button" class="icon-btn" data-delete="${escapeHtml(cat.id)}" aria-label="Poista kategoria ${escapeHtml(cat.name)}">🗑</button>
      </div>
    `;
  }).join('');
}

async function handleAdd(event) {
  event.preventDefault();
  const nameInput = qs('#cat-name');
  const colorInput = qs('#cat-color');
  const errorBox = qs('#cat-error');
  const submit = qs('#cat-form button[type="submit"]');
  clearError(errorBox);

  const name = nameInput.value.trim();
  if (!name) {
    showError(errorBox, 'Anna kategorian nimi.');
    return;
  }
  if (state.categories.some((c) => c.name.trim().toLowerCase() === name.toLowerCase())) {
    showError(errorBox, 'Samanniminen kategoria on jo olemassa.');
    return;
  }

  setBusy(submit, true, '…');
  try {
    const created = await db.createCategory({
      name,
      color: colorInput.value,
      sortOrder: nextSortOrder(),
    });
    setState({ categories: [...state.categories, created] });
    nameInput.value = '';
    colorInput.value = randomColor();
    toast('Kategoria lisätty', 'ok');
  } catch (err) {
    showError(errorBox, err.message);
  } finally {
    setBusy(submit, false);
  }
}

function randomColor() {
  const palette = ['#6366f1', '#0ea5e9', '#10b981', '#f59e0b', '#ef4444',
    '#ec4899', '#8b5cf6', '#14b8a6', '#f97316', '#84cc16'];
  return palette[Math.floor(Math.random() * palette.length)];
}

function openEditModal(categoryId) {
  const cat = state.categories.find((c) => c.id === categoryId);
  if (!cat) return;

  const sheet = openModal(`
    <h3 class="modal-title">Muokkaa kategoriaa</h3>
    <label for="edit-cat-name">Nimi</label>
    <input type="text" id="edit-cat-name" maxlength="40" value="${escapeHtml(cat.name)}">
    <label for="edit-cat-color">Väri</label>
    <input type="color" id="edit-cat-color" value="${escapeHtml(cat.color)}">
    <label class="hint" style="display:flex;align-items:center;gap:.5rem;margin-top:1rem">
      <input type="checkbox" id="edit-cat-archived" ${cat.archived ? 'checked' : ''}
             style="width:auto;min-height:auto">
      Arkistoitu (ei näy kirjausnäkymässä, historia säilyy)
    </label>
    <div id="edit-cat-error" class="alert alert-error hidden" role="alert"></div>
    <div class="btn-row">
      <button type="button" class="btn btn-secondary" data-cancel>Peruuta</button>
      <button type="button" class="btn btn-primary" data-save>Tallenna</button>
    </div>
  `);

  sheet.querySelector('[data-cancel]').addEventListener('click', closeModal);
  sheet.querySelector('[data-save]').addEventListener('click', async () => {
    const errorBox = sheet.querySelector('#edit-cat-error');
    const saveButton = sheet.querySelector('[data-save]');
    const name = sheet.querySelector('#edit-cat-name').value.trim();
    clearError(errorBox);

    if (!name) {
      showError(errorBox, 'Anna kategorian nimi.');
      return;
    }
    const duplicate = state.categories.some(
      (c) => c.id !== cat.id && c.name.trim().toLowerCase() === name.toLowerCase(),
    );
    if (duplicate) {
      showError(errorBox, 'Samanniminen kategoria on jo olemassa.');
      return;
    }

    setBusy(saveButton, true);
    try {
      const updated = await db.updateCategory(cat.id, {
        name,
        color: sheet.querySelector('#edit-cat-color').value,
        archived: sheet.querySelector('#edit-cat-archived').checked,
      });
      setState({
        categories: state.categories.map((c) => (c.id === cat.id ? updated : c)),
      });
      closeModal();
      toast('Kategoria päivitetty', 'ok');
    } catch (err) {
      showError(errorBox, err.message);
      setBusy(saveButton, false);
    }
  });
}

async function handleDelete(categoryId) {
  const cat = state.categories.find((c) => c.id === categoryId);
  if (!cat) return;
  const count = transactionCountByCategory().get(categoryId) || 0;

  if (count > 0) {
    // Tietokanta estaa poiston (on delete restrict) - tarjotaan arkistointia,
    // jolloin historia ja yhteenvedot pysyvat ehjina.
    const archive = await confirmModal({
      title: 'Kategoriaa ei voi poistaa',
      body: `Kategorialla "${cat.name}" on ${count} kirjausta, joten sitä ei voi poistaa ilman että historia rikkoutuu. Arkistoidaanko se sen sijaan? Arkistoitu kategoria ei näy kirjausnäkymässä, mutta vanhat kirjaukset säilyvät.`,
      confirmLabel: 'Arkistoi',
      danger: false,
    });
    if (!archive) return;
    try {
      const updated = await db.updateCategory(categoryId, { archived: true });
      setState({ categories: state.categories.map((c) => (c.id === categoryId ? updated : c)) });
      toast('Kategoria arkistoitu', 'ok');
    } catch (err) {
      toast(err.message, 'error');
    }
    return;
  }

  const confirmed = await confirmModal({
    title: 'Poistetaanko kategoria?',
    body: `Kategoria "${cat.name}" poistetaan pysyvästi. Sillä ei ole kirjauksia.`,
    confirmLabel: 'Poista',
  });
  if (!confirmed) return;

  try {
    await db.deleteCategory(categoryId);
    setState({ categories: state.categories.filter((c) => c.id !== categoryId) });
    toast('Kategoria poistettu', 'ok');
  } catch (err) {
    toast(err.message, 'error');
  }
}

export function initCategoriesView() {
  qs('#cat-form').addEventListener('submit', handleAdd);
  qs('#cat-color').value = randomColor();
  qs('#cat-list').addEventListener('click', (event) => {
    const editButton = event.target.closest('[data-edit]');
    if (editButton) { openEditModal(editButton.dataset.edit); return; }
    const deleteButton = event.target.closest('[data-delete]');
    if (deleteButton) handleDelete(deleteButton.dataset.delete);
  });
}

export function renderCategoriesView() {
  renderList();
}
