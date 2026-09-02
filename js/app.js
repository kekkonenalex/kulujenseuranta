// ============================================================
//  KÄYNNISTYS ja nakymien ohjaus.
//
//  Vastuut: asetusten tarkistus, session tarkistus, datan lataus,
//  valilehtien vaihto, kuukausinavigaatio, online-tila,
//  uloskirjautuminen ja service workerin rekisterointi.
// ============================================================

import { APP_VERSION } from './config.js';
import * as db from './db.js';
import { state, setState, subscribe } from './state.js';
import { currentMonth, monthLabel, addMonths } from './format.js';
import { qs, qsa, show, initModal, toast, closeModal } from './ui-common.js';
import { initAuthView, resetAuthView } from './ui-auth.js';
import { initEntryView, renderEntryView, refreshEntryDateIfStale } from './ui-entry.js';
import { initTransactionsView, renderTransactionsView } from './ui-transactions.js';
import { initSummaryView, renderSummaryView } from './ui-summary.js';
import { initBudgetView, renderBudgetView } from './ui-budget.js';
import { initCategoriesView, renderCategoriesView } from './ui-categories.js';
import { initExportView } from './export.js';

const VIEWS = {
  entry:        { panel: '#panel-entry',        title: 'Kirjaa kulu' },
  transactions: { panel: '#panel-transactions', title: 'Kulut' },
  summary:      { panel: '#panel-summary',      title: 'Yhteenveto' },
  budget:       { panel: '#panel-budget',       title: 'Budjetti' },
  settings:     { panel: '#panel-settings',     title: 'Asetukset' },
};

const RELOAD_AFTER_MS = 60_000; // taustalta palatessa data ladataan uudelleen

let viewsInitialised = false;
let lastLoadedAt = 0;

/* ------------------------------------------------------------
   Ruudut
   ------------------------------------------------------------ */

function showScreen(which) {
  show(qs('#boot'), which === 'boot');
  show(qs('#view-config'), which === 'config');
  show(qs('#view-auth'), which === 'auth');
  show(qs('#view-app'), which === 'app');
}

/* ------------------------------------------------------------
   Renderointi
   ------------------------------------------------------------ */

function renderChrome() {
  const view = VIEWS[state.view] ? state.view : 'entry';

  for (const [name, config] of Object.entries(VIEWS)) {
    show(qs(config.panel), name === view);
  }
  qsa('.tab').forEach((tab) => {
    tab.classList.toggle('is-active', tab.dataset.view === view);
  });
  qs('#topbar-title').textContent = VIEWS[view].title;

  qsa('[data-month-label]').forEach((element) => {
    element.textContent = monthLabel(state.month);
  });
  // Tulevaisuuteen ei ole mitaan katsottavaa.
  const atCurrentMonth = state.month >= currentMonth();
  qsa('[data-month-next]').forEach((button) => { button.disabled = atCurrentMonth; });

  show(qs('#offline-badge'), !state.online);
  qs('#settings-email').textContent = state.user ? (state.user.email || '') : '';
  qs('#settings-version').textContent = `Versio ${APP_VERSION}`;
}

function renderAll() {
  if (!state.user) return;
  renderChrome();
  renderEntryView();
  renderTransactionsView();
  renderSummaryView();
  renderBudgetView();
  renderCategoriesView();
}

/* ------------------------------------------------------------
   Data
   ------------------------------------------------------------ */

async function loadData() {
  const [categories, transactions, budgets] = await Promise.all([
    db.fetchCategories(),
    db.fetchTransactions(),
    db.fetchBudgets(),
  ]);
  lastLoadedAt = Date.now();
  setState({ categories, transactions, budgets });
}

async function loadDataSafely() {
  try {
    await loadData();
  } catch (err) {
    toast(err.message, 'error');
  }
}

/* ------------------------------------------------------------
   Kirjautuminen sisaan ja ulos
   ------------------------------------------------------------ */

async function startApp(session) {
  if (!session || !session.user) { showScreen('auth'); return; }

  setState({ user: session.user, view: 'entry', month: currentMonth() });
  showScreen('app');

  if (!viewsInitialised) {
    initEntryView();
    initTransactionsView();
    initSummaryView();
    initBudgetView();
    initCategoriesView();
    initExportView({ reloadData: loadData });
    viewsInitialised = true;
  }

  renderAll();
  await loadDataSafely();
}

async function handleSignOut() {
  try {
    await db.signOut();
  } catch (err) {
    // Uloskirjautuminen tehdaan paikallisesti vaikka verkko ei vastaisi.
    console.warn('Uloskirjautuminen palvelimelta ei onnistunut:', err.message);
  }
  closeModal();
  setState({ user: null, categories: [], transactions: [], budgets: [], view: 'entry' });
  resetAuthView();
  showScreen('auth');
}

/* ------------------------------------------------------------
   Kytkennat
   ------------------------------------------------------------ */

function wireChrome() {
  qs('#tabbar').addEventListener('click', (event) => {
    const tab = event.target.closest('.tab');
    if (tab && VIEWS[tab.dataset.view]) setState({ view: tab.dataset.view });
  });

  // "Hallitse"-linkit kirjausnakymasta asetuksiin
  document.addEventListener('click', (event) => {
    const link = event.target.closest('[data-goto]');
    if (link && VIEWS[link.dataset.goto]) setState({ view: link.dataset.goto });
  });

  qsa('[data-month-prev]').forEach((button) => {
    button.addEventListener('click', () => setState({ month: addMonths(state.month, -1) }));
  });
  qsa('[data-month-next]').forEach((button) => {
    button.addEventListener('click', () => {
      const next = addMonths(state.month, 1);
      if (next <= currentMonth()) setState({ month: next });
    });
  });

  qs('#btn-signout').addEventListener('click', handleSignOut);

  window.addEventListener('online', () => setState({ online: true }));
  window.addEventListener('offline', () => setState({ online: false }));

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible' || !state.user) return;
    refreshEntryDateIfStale();
    if (Date.now() - lastLoadedAt > RELOAD_AFTER_MS) loadDataSafely();
  });
}

function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  const isSecure = location.protocol === 'https:'
    || ['localhost', '127.0.0.1'].includes(location.hostname);
  if (!isSecure) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch((err) => {
      console.warn('Service workerin rekisteröinti ei onnistunut:', err);
    });
  });
}

/* ------------------------------------------------------------
   Boot
   ------------------------------------------------------------ */

async function boot() {
  initModal();
  wireChrome();
  registerServiceWorker();
  subscribe(renderAll);

  if (!db.isConfigured()) {
    showScreen('config');
    return;
  }

  initAuthView({ onSignedIn: (session) => startApp(session) });

  try {
    const session = await db.getSession();
    if (session) {
      await startApp(session);
    } else {
      showScreen('auth');
    }

    db.onAuthChange((event, newSession) => {
      if (event === 'SIGNED_OUT') {
        setState({ user: null, categories: [], transactions: [], budgets: [] });
        resetAuthView();
        showScreen('auth');
        return;
      }
      if (event === 'SIGNED_IN' && !state.user && newSession) {
        startApp(newSession);
      }
    });
  } catch (err) {
    showScreen('auth');
    toast(err.message, 'error');
  }
}

boot();
