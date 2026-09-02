// ============================================================
//  LAITETUNNISTEET: iPhonen pikakomento kirjoittaa kuluja
//  ilman kirjautumista tallan tunnisteen avulla.
//
//  Tunniste arvotaan selaimessa ja naytetaan kerran. Palvelimelle
//  lahtee vain SHA-256-tiiviste, joten tunnistetta ei voi katsoa
//  jalkikateen mistaan - kadonneen tilalle luodaan uusi.
// ============================================================

import * as db from './db.js';
import { state, setState } from './state.js';
import { formatDate } from './format.js';
import {
  qs, show, showError, clearError, setBusy, toast, escapeHtml,
  openModal, closeModal, confirmModal,
} from './ui-common.js';

const SHORTCUT_URL = 'https://github.com/kekkonenalex/kulujenseuranta/blob/main/PIKAKOMENTO.md';

/** 32 satunnaista tavua base64url-muodossa (43 merkkia). */
function generateToken() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function sha256Hex(text) {
  const buffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function renderList() {
  const list = qs('#token-list');
  const tokens = state.deviceTokens;

  show(qs('#token-empty'), tokens.length === 0);

  list.innerHTML = tokens.map((token) => `
    <div class="token-row">
      <div class="token-main">
        <span class="token-name">${escapeHtml(token.name)}</span>
        <span class="muted small">
          Luotu ${escapeHtml(formatDate(token.created_at.slice(0, 10)))} ·
          ${token.last_used_at
            ? `käytetty ${escapeHtml(formatDate(token.last_used_at.slice(0, 10)))}`
            : 'ei vielä käytössä'}
        </span>
      </div>
      <button type="button" class="icon-btn" data-token-delete="${escapeHtml(token.id)}"
              aria-label="Poista laitetunniste ${escapeHtml(token.name)}">🗑</button>
    </div>`).join('');
}

function showTokenOnce(token, name) {
  const sheet = openModal(`
    <h3 class="modal-title">Laitetunniste luotu</h3>
    <p class="muted small">
      Tämä näytetään <strong>vain kerran</strong>. Kopioi se pikakomentoon nyt —
      tietokantaan tallennettiin vain tiiviste, joten tunnistetta ei voi katsoa myöhemmin.
      Kadonneen tilalle luodaan uusi.
    </p>

    <div class="token-value" id="token-value">${escapeHtml(token)}</div>

    <button type="button" class="btn btn-primary btn-block" data-copy>Kopioi leikepöydälle</button>
    <p class="hint" id="token-copy-status"></p>

    <p class="muted small">
      Nimi: <strong>${escapeHtml(name)}</strong>. Ohje pikakomennon rakentamiseen on
      tiedostossa <code>PIKAKOMENTO.md</code>.
    </p>

    <div class="btn-row">
      <button type="button" class="btn btn-secondary" data-close>Valmis</button>
    </div>
  `);

  sheet.querySelector('[data-close]').addEventListener('click', closeModal);
  sheet.querySelector('[data-copy]').addEventListener('click', async () => {
    const status = sheet.querySelector('#token-copy-status');
    try {
      await navigator.clipboard.writeText(token);
      status.textContent = 'Kopioitu.';
    } catch {
      // Safari voi estaa leikepoydan; valitaan teksti jotta sen voi kopioida kasin.
      const range = document.createRange();
      range.selectNodeContents(sheet.querySelector('#token-value'));
      const selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
      status.textContent = 'Kopiointi ei onnistunut automaattisesti — teksti on valittuna.';
    }
  });
}

async function handleCreate() {
  const nameInput = qs('#token-name');
  const errorBox = qs('#token-error');
  const button = qs('#btn-create-token');
  clearError(errorBox);

  const name = nameInput.value.trim() || 'iPhone';
  const token = generateToken();

  setBusy(button, true, 'Luodaan…');
  try {
    const tokenHash = await sha256Hex(token);
    const created = await db.createDeviceToken({ name, tokenHash });
    setState({ deviceTokens: [created, ...state.deviceTokens] });
    nameInput.value = '';
    showTokenOnce(token, name);
  } catch (err) {
    showError(errorBox, err.message);
  } finally {
    setBusy(button, false);
  }
}

async function handleDelete(id) {
  const token = state.deviceTokens.find((t) => t.id === id);
  if (!token) return;

  const confirmed = await confirmModal({
    title: 'Poistetaanko laitetunniste?',
    body: `Pikakomento joka käyttää tunnistetta "${token.name}" lakkaa toimimasta heti. Kirjatut kulut säilyvät.`,
    confirmLabel: 'Poista',
  });
  if (!confirmed) return;

  try {
    await db.deleteDeviceToken(id);
    setState({ deviceTokens: state.deviceTokens.filter((t) => t.id !== id) });
    toast('Laitetunniste poistettu', 'ok');
  } catch (err) {
    toast(err.message, 'error');
  }
}

export function initTokensView() {
  qs('#btn-create-token').addEventListener('click', handleCreate);
  qs('#token-list').addEventListener('click', (event) => {
    const button = event.target.closest('[data-token-delete]');
    if (button) handleDelete(button.dataset.tokenDelete);
  });
  qs('#shortcut-help').setAttribute('href', SHORTCUT_URL);
}

export function renderTokensView() {
  renderList();
}
