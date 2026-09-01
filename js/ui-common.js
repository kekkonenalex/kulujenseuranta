// ============================================================
//  Pienet UI-apurit: valinta, nakyvyys, toast, modaali.
// ============================================================

export const qs = (selector, root = document) => root.querySelector(selector);
export const qsa = (selector, root = document) => Array.from(root.querySelectorAll(selector));

export function show(element, visible = true) {
  if (element) element.classList.toggle('hidden', !visible);
}

export function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/* ---------- Virheruudut ---------- */

export function showError(element, message) {
  if (!element) return;
  element.textContent = message;
  show(element, true);
}

export function clearError(element) {
  if (!element) return;
  element.textContent = '';
  show(element, false);
}

/* ---------- Painikkeen odotustila ---------- */

export function setBusy(button, busy, busyLabel = 'Tallennetaan…') {
  if (!button) return;
  if (busy) {
    if (!button.dataset.label) button.dataset.label = button.textContent;
    button.disabled = true;
    button.textContent = busyLabel;
  } else {
    button.disabled = false;
    if (button.dataset.label) button.textContent = button.dataset.label;
  }
}

/* ---------- Toast ---------- */

let toastTimer = null;

export function toast(message, kind = 'ok') {
  const element = qs('#toast');
  if (!element) return;
  element.textContent = message;
  element.className = `toast is-${kind}`;
  show(element, true);
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => show(element, false), 2600);
}

/* ---------- Modaali ---------- */

let escapeHandler = null;

export function openModal(html) {
  const modal = qs('#modal');
  const sheet = qs('#modal-sheet');
  sheet.innerHTML = html;
  show(modal, true);

  escapeHandler = (event) => { if (event.key === 'Escape') closeModal(); };
  document.addEventListener('keydown', escapeHandler);

  const firstInput = sheet.querySelector('input, select, textarea, button');
  if (firstInput && firstInput.tagName !== 'BUTTON') {
    setTimeout(() => firstInput.focus(), 60);
  }
  return sheet;
}

export function closeModal() {
  const modal = qs('#modal');
  const sheet = qs('#modal-sheet');
  show(modal, false);
  sheet.innerHTML = '';
  if (escapeHandler) {
    document.removeEventListener('keydown', escapeHandler);
    escapeHandler = null;
  }
}

export function initModal() {
  qsa('[data-modal-close]').forEach((element) => {
    element.addEventListener('click', closeModal);
  });
}

/** Vahvistuskysely modaalissa. Palauttaa Promise<boolean>. */
export function confirmModal({ title, body, confirmLabel = 'Poista', danger = true }) {
  return new Promise((resolve) => {
    const sheet = openModal(`
      <h3 class="modal-title">${escapeHtml(title)}</h3>
      <p class="muted">${escapeHtml(body)}</p>
      <div class="btn-row">
        <button type="button" class="btn btn-secondary" data-cancel>Peruuta</button>
        <button type="button" class="btn ${danger ? 'btn-danger' : 'btn-primary'}" data-confirm>
          ${escapeHtml(confirmLabel)}
        </button>
      </div>
    `);
    const done = (value) => { closeModal(); resolve(value); };
    sheet.querySelector('[data-cancel]').addEventListener('click', () => done(false));
    sheet.querySelector('[data-confirm]').addEventListener('click', () => done(true));
  });
}

/** Lataa tiedosto selaimesta (Blob -> latauslinkki). */
export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
