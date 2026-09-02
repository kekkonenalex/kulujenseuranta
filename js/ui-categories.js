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
  show(qs('#cat-reorder-hint'), categories.length > 1);

  list.innerHTML = categories.map((cat) => {
    const count = counts.get(cat.id) || 0;
    return `
      <div class="cat-row" data-cat-id="${escapeHtml(cat.id)}">
        <span class="drag-handle" data-drag-handle aria-hidden="true">⠿</span>
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

/* ------------------------------------------------------------
   Kategorioiden jarjestys raahaamalla

   Pointer events kattaa seka kosketuksen etta hiiren. Raahaus alkaa
   vain kahvasta: jos koko rivi olisi raahattava, listan vierittaminen
   sormella tarttuisi vahingossa riviin kiinni. Siksi touch-action:
   none on vain kahvassa - muualla selain saa vierittaa normaalisti.
   ------------------------------------------------------------ */

let drag = null;

/** Rivit DOM-jarjestyksessa. */
function rowElements(list) {
  return Array.from(list.querySelectorAll('.cat-row'));
}

function onPointerDown(event) {
  const handle = event.target.closest('[data-drag-handle]');
  if (!handle || event.button > 0) return;

  const row = handle.closest('.cat-row');
  const list = qs('#cat-list');
  if (!row || !list) return;

  event.preventDefault();

  drag = {
    row,
    list,
    pointerId: event.pointerId,
    originY: event.clientY,
    moved: false,
  };

  // Kuuntelijat ikkunaan, ei kahvaan: insertBefore siirtaa rivin DOM:issa,
  // jolloin selain voi menettaa pointer capturen ja loput tapahtumat
  // menisivat ohi kesken raahauksen.
  window.addEventListener('pointermove', onPointerMove);
  window.addEventListener('pointerup', onPointerUp);
  window.addEventListener('pointercancel', onPointerUp);

  row.classList.add('is-dragging');
  document.body.classList.add('is-reordering');
}

function onPointerMove(event) {
  if (!drag || event.pointerId !== drag.pointerId) return;

  const delta = event.clientY - drag.originY;
  if (Math.abs(delta) > 4) drag.moved = true;
  drag.row.style.transform = `translateY(${delta}px)`;

  const dragRect = drag.row.getBoundingClientRect();
  const dragMiddle = dragRect.top + dragRect.height / 2;

  for (const sibling of rowElements(drag.list)) {
    if (sibling === drag.row) continue;

    const rect = sibling.getBoundingClientRect();
    const siblingMiddle = rect.top + rect.height / 2;
    const position = sibling.compareDocumentPosition(drag.row);
    const dragIsAfter = Boolean(position & Node.DOCUMENT_POSITION_FOLLOWING);
    const dragIsBefore = Boolean(position & Node.DOCUMENT_POSITION_PRECEDING);

    if (dragMiddle < siblingMiddle && dragIsAfter) {
      drag.list.insertBefore(drag.row, sibling);
    } else if (dragMiddle > siblingMiddle && dragIsBefore) {
      drag.list.insertBefore(drag.row, sibling.nextSibling);
    } else {
      continue;
    }

    // Rivi hyppasi uuteen paikkaan: nollataan siirtyma ja otetaan
    // nykyinen sormen sijainti uudeksi lahtokohdaksi.
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
  document.body.classList.remove('is-reordering');

  if (moved) saveOrder(rowElements(list).map((element) => element.dataset.catId));
}

/**
 * Tallentaa uuden jarjestyksen. Paivitetaan vain ne rivit joiden
 * sort_order oikeasti muuttui - yksi siirto koskee harvoin kaikkia.
 * Nakyma paivitetaan heti ja palautetaan jos tallennus epaonnistuu.
 */
async function saveOrder(orderedIds) {
  const updates = [];
  orderedIds.forEach((id, index) => {
    const category = state.categories.find((c) => c.id === id);
    const sortOrder = (index + 1) * 10;
    if (category && category.sort_order !== sortOrder) updates.push({ id, sortOrder });
  });
  if (updates.length === 0) return;

  const previous = state.categories;
  setState({
    categories: state.categories.map((category) => {
      const update = updates.find((u) => u.id === category.id);
      return update ? { ...category, sort_order: update.sortOrder } : category;
    }),
  });

  try {
    await Promise.all(updates.map((u) => db.updateCategory(u.id, { sortOrder: u.sortOrder })));
    toast('Järjestys tallennettu', 'ok');
  } catch (err) {
    setState({ categories: previous });
    toast(err.message, 'error');
  }
}

export function initCategoriesView() {
  qs('#cat-form').addEventListener('submit', handleAdd);
  qs('#cat-color').value = randomColor();
  qs('#cat-list').addEventListener('pointerdown', onPointerDown);
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
