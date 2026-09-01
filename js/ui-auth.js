// ============================================================
//  Kirjautuminen ja tunnuksen luonti (sahkoposti + salasana).
//  Sessio sailyy localStoragessa, joten kirjautuminen tarvitaan
//  vain harvoin - kirjaus onnistuu heti sovelluksen avatessa.
// ============================================================

import * as db from './db.js';
import { qs, show, showError, clearError, setBusy } from './ui-common.js';

let mode = 'signin'; // 'signin' | 'signup'
let onSignedIn = () => {};

function applyMode() {
  const isSignup = mode === 'signup';
  qs('#auth-lead').textContent = isSignup
    ? 'Luo tunnus ensimmäistä kertaa.'
    : 'Kirjaudu sisään jatkaaksesi.';
  qs('#auth-submit').textContent = isSignup ? 'Luo tunnus' : 'Kirjaudu sisään';
  qs('#auth-toggle').textContent = isSignup
    ? 'Onko sinulla jo tunnus? Kirjaudu sisään'
    : 'Ei vielä tunnusta? Luo tunnus';
  qs('#auth-password').setAttribute('autocomplete', isSignup ? 'new-password' : 'current-password');
  show(qs('#auth-hint'), isSignup);
  clearError(qs('#auth-error'));
  show(qs('#auth-info'), false);
}

async function handleSubmit(event) {
  event.preventDefault();
  const email = qs('#auth-email').value.trim();
  const password = qs('#auth-password').value;
  const errorBox = qs('#auth-error');
  const infoBox = qs('#auth-info');
  const submit = qs('#auth-submit');

  clearError(errorBox);
  show(infoBox, false);

  if (!email || !email.includes('@')) {
    showError(errorBox, 'Anna kelvollinen sähköpostiosoite.');
    return;
  }
  if (password.length < 8) {
    showError(errorBox, 'Salasanassa pitää olla vähintään 8 merkkiä.');
    return;
  }

  setBusy(submit, true, mode === 'signup' ? 'Luodaan…' : 'Kirjaudutaan…');
  try {
    if (mode === 'signup') {
      const { session } = await db.signUp(email, password);
      if (!session) {
        // Sahkopostivahvistus on paalla projektin asetuksissa.
        infoBox.textContent = 'Tunnus luotu. Avaa sähköpostistasi vahvistuslinkki ja kirjaudu sen jälkeen sisään.';
        show(infoBox, true);
        mode = 'signin';
        applyMode();
        show(infoBox, true);
        return;
      }
      onSignedIn(session);
      return;
    }

    const data = await db.signIn(email, password);
    onSignedIn(data.session);
  } catch (err) {
    showError(errorBox, err.message);
  } finally {
    setBusy(submit, false);
  }
}

export function initAuthView(handlers = {}) {
  onSignedIn = handlers.onSignedIn || (() => {});
  qs('#auth-form').addEventListener('submit', handleSubmit);
  qs('#auth-toggle').addEventListener('click', () => {
    mode = mode === 'signin' ? 'signup' : 'signin';
    applyMode();
  });
  applyMode();
}

export function resetAuthView() {
  mode = 'signin';
  qs('#auth-password').value = '';
  applyMode();
}
