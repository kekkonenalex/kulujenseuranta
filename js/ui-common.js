// ============================================================
//  Small UI helpers: selecting, showing, escaping, the toast and the sheet.
//
//  Everything with text from the database (Otso's notes, merchant names, notes) goes through
//  escapeHtml before it reaches innerHTML: it's shown as text, never as markup.
// ============================================================

export const qs = (selector, root = document) => root.querySelector(selector);
export const qsa = (selector, root = document) => Array.from(root.querySelectorAll(selector));

export function show(element, visible = true) {
  if (element) element.hidden = !visible;
}

export function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/** A safe colour for a style attribute: #rrggbb or a neutral. */
export function safeColor(value) {
  return /^#[0-9a-f]{6}$/i.test(String(value || '')) ? value : '#6b6560';
}

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

export function setBusy(button, busy, busyLabel = 'Saving…') {
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

/* ---------- The toast: a line at the bottom, with one action (Undo) when there is one ---------- */

let toastTimer = null;

export function toast(message, kind = 'ok', action = null) {
  const element = qs('#toast');
  if (!element) return;
  element.className = `toast is-${kind}`;
  element.replaceChildren(document.createTextNode(message));
  if (action) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'toast-action';
    button.textContent = action.label;
    button.addEventListener('click', () => { show(element, false); action.run(); });
    element.append(button);
  }
  show(element, true);
  clearTimeout(toastTimer);
  // Errors stay longer (they're read, not glanced at), and an action stays long enough to be pressed.
  toastTimer = setTimeout(() => show(element, false), kind === 'error' ? 7000 : action ? 6000 : 2800);
}

/* ---------- The sheet: one at a time, from the bottom, a real dialog ---------- */

let onClose = null;
let returnFocus = null;

function focusables(root) {
  return qsa('a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])', root)
    .filter((el) => !el.closest('[hidden]'));
}

function trap(event) {
  if (event.key === 'Escape') { closeSheet(); return; }
  if (event.key !== 'Tab') return;
  const items = focusables(qs('#sheet-panel'));
  if (!items.length) return;
  const first = items[0];
  const last = items[items.length - 1];
  if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
  else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
}

/**
 * Opens the sheet with a title and body HTML; returns the body element. `focus`: an element to focus
 * (a selector), or nothing: the sheet itself takes focus, so no keyboard pops up for a sheet that's only
 * looked at.
 */
export function openSheet(title, html, { focus = null, closing = null, wide = false } = {}) {
  const sheet = qs('#sheet');
  const panel = qs('#sheet-panel');
  if (!sheet.hidden && onClose) { const fn = onClose; onClose = null; fn(); }
  if (sheet.hidden) returnFocus = document.activeElement;
  qs('#sheet-title').textContent = title;
  const body = qs('#sheet-body');
  body.innerHTML = html;
  panel.classList.toggle('is-wide', wide);
  show(sheet, true);
  document.body.classList.add('has-sheet');
  qs('#app-main').setAttribute('inert', '');
  document.addEventListener('keydown', trap);
  onClose = closing;
  const target = focus ? qs(focus, body) : panel;
  setTimeout(() => (target || panel).focus(), 30);
  return body;
}

export function closeSheet() {
  const sheet = qs('#sheet');
  if (sheet.hidden) return;
  show(sheet, false);
  qs('#sheet-body').innerHTML = '';
  document.body.classList.remove('has-sheet');
  qs('#app-main').removeAttribute('inert');
  document.removeEventListener('keydown', trap);
  const fn = onClose;
  onClose = null;
  if (fn) fn();
  if (returnFocus && document.contains(returnFocus)) returnFocus.focus();
}

export function initSheet() {
  qsa('[data-sheet-close]').forEach((element) => element.addEventListener('click', closeSheet));
}

/** A yes/no question in the sheet. Resolves false if the sheet is closed any other way. */
export function confirmSheet({ title, body, confirmLabel = 'Delete', danger = true }) {
  return new Promise((resolve) => {
    let answered = false;
    const done = (value) => { if (!answered) { answered = true; resolve(value); } };
    const sheetBody = openSheet(title, `
      <p class="sheet-text">${escapeHtml(body)}</p>
      <div class="btn-row">
        <button type="button" class="btn btn-quiet" data-cancel>Cancel</button>
        <button type="button" class="btn ${danger ? 'btn-danger' : 'btn-primary'}" data-confirm>${escapeHtml(confirmLabel)}</button>
      </div>`, { closing: () => done(false) });
    sheetBody.querySelector('[data-cancel]').addEventListener('click', () => { done(false); closeSheet(); });
    sheetBody.querySelector('[data-confirm]').addEventListener('click', () => { done(true); closeSheet(); });
  });
}

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
