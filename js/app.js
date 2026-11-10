// ============================================================
//  Starting up, signing in, the three views and the month.
//
//  The app opens on Month: it's used to review (Apple Pay through Otso and the Shortcut do most of the
//  logging). Logging is the + button. Settings sit behind the icon at the top.
// ============================================================

import * as db from './db.js';
import { state, setState, subscribe, lastMonth } from './state.js';
import { currentMonth, monthLabel, addMonths } from './format.js';
import { qs, qsa, show, initSheet, toast, closeSheet, showError, clearError, setBusy } from './ui-common.js';
import { icon, mark } from './icons.js';
import { renderMonth } from './ui-month.js';
import { renderExpenses } from './ui-expenses.js';
import { renderOtso } from './ui-otso.js';
import { openLog } from './ui-log.js';
import { openSettings } from './ui-settings.js';

const VIEWS = {
  month: { panel: '#panel-month', title: 'Month', render: renderMonth, months: true },
  expenses: { panel: '#panel-expenses', title: 'Expenses', render: renderExpenses, months: true },
  otso: { panel: '#panel-otso', title: 'Otso', render: renderOtso, months: false },
};
const RELOAD_AFTER_MS = 60_000; // back from the background after this long: the data is read again
let lastLoadedAt = 0;

/** The loading screen goes once there's something to look at: the month drawn, or the sign-in. */
function ready() {
  document.documentElement.classList.add('ready');
}

function showScreen(which) {
  if (which !== 'boot' && which !== 'app') ready();
  show(qs('#view-config'), which === 'config');
  show(qs('#view-auth'), which === 'auth');
  show(qs('#view-app'), which === 'app');
}

/* ---------- Drawing: the frame, and only the view on screen ---------- */

function renderFrame() {
  const view = VIEWS[state.view] ? state.view : 'month';
  for (const [name, config] of Object.entries(VIEWS)) show(qs(config.panel), name === view);
  qsa('.tab').forEach((tab) => {
    if (tab.dataset.view === view) tab.setAttribute('aria-current', 'page');
    else tab.removeAttribute('aria-current');
  });
  qs('#topbar-title').textContent = VIEWS[view].title;
  show(qs('#month-nav'), VIEWS[view].months);
  qs('[data-month-label]').textContent = monthLabel(state.month);
  qs('[data-month-prev]').disabled = false;
  qs('[data-month-next]').disabled = state.month >= lastMonth();
  show(qs('#offline-badge'), !state.online);
}

function renderAll() {
  if (!state.user) return;
  renderFrame();
  const view = VIEWS[state.view] || VIEWS.month;
  view.render(qs(view.panel));
}

/* ---------- Data ---------- */

async function loadData() {
  const [categories, transactions, budgets, deviceTokens, income, paydays, notes, monthlyBudgets] = await Promise.all([
    db.fetchCategories(), db.fetchTransactions(), db.fetchBudgets(), db.fetchDeviceTokens(),
    db.fetchIncome(), db.fetchPaydays(), db.fetchNotes(), db.fetchMonthlyBudgets(),
  ]);
  lastLoadedAt = Date.now();
  setState({
    categories, transactions, budgets, deviceTokens, loaded: true,
    income: income || [], paydays: paydays || [], notes: notes || [],
    hasBuild1: income !== null && notes !== null,
    monthlyBudgets: monthlyBudgets || [], hasMonthly: monthlyBudgets !== null,
  });
  ready();
}

export async function reloadData() {
  try {
    await loadData();
  } catch (err) {
    ready(); // (what's on screen, with the error said, beats the bear breathing for ever)
    toast(err.message, 'error');
  }
}

/* ---------- Signing in and out ---------- */

async function startApp(session) {
  if (!session || !session.user) { showScreen('auth'); return; }
  setState({ user: session.user, view: 'month', month: currentMonth() });
  showScreen('app');
  await reloadData();
}

export async function signOut() {
  try { await db.signOut(); } catch (err) { console.warn('Signing out at the server failed:', err.message); }
  closeSheet();
  setState({ user: null, categories: [], transactions: [], budgets: [], deviceTokens: [], income: [], paydays: [], notes: [], loaded: false });
  showScreen('auth');
}

async function handleSignIn(event) {
  event.preventDefault();
  const email = qs('#auth-email').value.trim();
  const password = qs('#auth-password').value;
  const errorBox = qs('#auth-error');
  const submit = qs('#auth-submit');
  clearError(errorBox);
  if (!email.includes('@')) { showError(errorBox, 'Enter your email address.'); return; }
  if (!password) { showError(errorBox, 'Enter your password.'); return; }
  setBusy(submit, true, 'Signing in…');
  try {
    const data = await db.signIn(email, password);
    qs('#auth-password').value = '';
    await startApp(data && data.session);
  } catch (err) {
    showError(errorBox, err.message);
  } finally {
    setBusy(submit, false);
  }
}

/* ---------- Wiring ---------- */

function wire() {
  qs('#boot-mark').innerHTML = mark(112, { full: true });
  qs('#auth-mark').innerHTML = mark(52);
  qs('#topbar-mark').innerHTML = mark(28);
  qs('#rail-mark').innerHTML = mark(30);
  qs('#btn-settings').innerHTML = icon('settings');
  qs('[data-month-prev]').innerHTML = icon('prev');
  qs('[data-month-next]').innerHTML = icon('next');
  qs('#sheet-close').innerHTML = icon('close');
  qs('#fab').innerHTML = icon('plus');
  qsa('[data-icon]').forEach((el) => { el.innerHTML = icon(el.dataset.icon); });

  qs('#auth-form').addEventListener('submit', handleSignIn);
  qs('#tabbar').addEventListener('click', (event) => {
    const tab = event.target.closest('.tab');
    if (tab && VIEWS[tab.dataset.view]) { setState({ view: tab.dataset.view }); window.scrollTo(0, 0); }
  });
  qs('[data-month-prev]').addEventListener('click', () => setState({ month: addMonths(state.month, -1) }));
  qs('[data-month-next]').addEventListener('click', () => {
    const next = addMonths(state.month, 1);
    if (next <= lastMonth()) setState({ month: next });
  });
  qs('#fab').addEventListener('click', () => openLog());
  qs('#rail-log').addEventListener('click', () => openLog());
  qs('#btn-settings').addEventListener('click', () => openSettings());

  window.addEventListener('online', () => setState({ online: true }));
  window.addEventListener('offline', () => setState({ online: false }));
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible' || !state.user) return;
    if (Date.now() - lastLoadedAt > RELOAD_AFTER_MS) reloadData();
  });
}

function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  const secure = location.protocol === 'https:' || ['localhost', '127.0.0.1'].includes(location.hostname);
  if (!secure || location.pathname.includes('/tools/')) return; // (not in the local preview: it would serve stale files)
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch((err) => console.warn('The service worker failed:', err));
  });
}

async function boot() {
  initSheet();
  wire();
  registerServiceWorker();
  subscribe(renderAll);

  if (!db.isConfigured()) { showScreen('config'); return; }
  try {
    const session = await db.getSession();
    if (session) await startApp(session);
    else showScreen('auth');
    db.onAuthChange((event, newSession) => {
      if (event === 'SIGNED_OUT') {
        setState({ user: null });
        showScreen('auth');
      } else if (event === 'SIGNED_IN' && !state.user && newSession) {
        startApp(newSession);
      }
    });
  } catch (err) {
    showScreen('auth');
    toast(err.message, 'error');
  }
}

boot();
