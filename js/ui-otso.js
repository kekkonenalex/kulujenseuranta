// ============================================================
//  Otso: what Otso did here and what it noticed. Its read on the month (O1), what looks wrong (O3, N6,
//  worked out in this app), what it logged in the last week with Undo (O6), and its monthly letters
//  (O7). Nothing here pushes: Otso still messages on Telegram; this is the desk where its work shows.
// ============================================================

import * as db from './db.js';
import { state, setState, readCard, flags, dismissFlag, loggedByOtso, letters, otsoToken, categoryById } from './state.js';
import { formatMoney, formatDay, monthLabel } from './format.js';
import { escapeHtml, toast } from './ui-common.js';
import { openExpense, deleteWithUndo } from './ui-expenses.js';
import { openSettings } from './ui-settings.js';

const SHOWN = 6; // the newest of what Otso logged; the rest are in Expenses, filtered to Otso

export function renderOtso(panel) {
  if (!state.loaded) { panel.innerHTML = '<p class="empty">Loading…</p>'; return; }
  const card = readCard();
  const found = flags();
  const logged = loggedByOtso(7);
  const kept = letters();
  const token = otsoToken();

  panel.innerHTML = `
    <div class="col col-main">
    <p class="desk-intro">What Otso did here and what it noticed. Nothing here sends you anything: Otso's messages stay in Telegram.</p>
    ${setupHtml(token)}
    ${card ? `<section class="read" aria-label="Otso's read"><div class="read-head"><span class="read-kicker">Otso's read</span>
      <button type="button" class="link-btn" data-hide-read>Hide</button></div>
      <h3 class="read-title">${escapeHtml(card.title)}</h3><p class="read-body">${escapeHtml(card.body)}</p></section>` : ''}

    <section aria-labelledby="flags-head">
      <div class="section-head"><h2 class="section-title" id="flags-head">Worth a look</h2><span class="muted small">${found.length || 'none'}</span></div>
      ${found.length ? found.map(flagHtml).join('') : '<p class="empty">Nothing looks off: no doubles, nothing far bigger than usual.</p>'}
    </section>
    </div>
    <div class="col col-side">

    <section aria-labelledby="logged-head">
      <div class="section-head"><h2 class="section-title" id="logged-head">Logged by Otso, last 7 days</h2>
        <span class="muted small num">${escapeHtml(formatMoney(logged.reduce((s, tx) => s + tx.amount_cents, 0)))}</span></div>
      ${logged.length ? logged.slice(0, SHOWN).map(loggedHtml).join('') : `<p class="empty">${token ? 'Nothing this week.' : 'Otso logs with its own token (Settings, Connections).'}</p>`}
      ${logged.length > SHOWN ? `<button type="button" class="link-btn" data-all-otso>All ${logged.length} in Expenses</button>` : ''}
    </section>

    <section aria-labelledby="letters-head">
      <div class="section-head"><h2 class="section-title" id="letters-head">Monthly letters</h2></div>
      ${kept.length ? kept.map(letterHtml).join('') : '<p class="empty">On the 1st, Otso writes how last month went. It\'ll be kept here.</p>'}
    </section>
    </div>`;

  const hide = panel.querySelector('[data-hide-read]');
  if (hide) hide.addEventListener('click', async () => {
    try {
      const updated = await db.dismissNote(card.id);
      setState({ notes: state.notes.map((n) => (n.id === card.id ? updated : n)) });
    } catch (err) { toast(err.message, 'error'); }
  });
  panel.querySelectorAll('[data-open]').forEach((el) => el.addEventListener('click', () => openExpense(el.dataset.open)));
  panel.querySelectorAll('[data-ok]').forEach((el) => el.addEventListener('click', () => { dismissFlag(el.dataset.ok); toast('Marked as right'); }));
  panel.querySelectorAll('[data-undo]').forEach((el) => el.addEventListener('click', () => {
    const tx = state.transactions.find((t) => t.id === el.dataset.undo);
    if (tx) deleteWithUndo(tx, { ask: false });
  }));
  const all = panel.querySelector('[data-all-otso]');
  if (all) all.addEventListener('click', () => { setState({ view: 'expenses', filter: 'otso', query: '' }); window.scrollTo(0, 0); });
  const setup = panel.querySelector('[data-setup]');
  if (setup) setup.addEventListener('click', () => openSettings('connections'));
}

function setupHtml(token) {
  if (!state.hasBuild1) {
    return `<p class="alert alert-info">This part of the app needs the database update: paste <code>sql/build1.sql</code> into Supabase's SQL Editor.</p>`;
  }
  if (token && token.can_note) return '';
  return `<p class="alert alert-info">For Otso's read and monthly letters to show here, give Otso's token the <b>Otso's notes</b> right.
    <button type="button" class="link-btn" data-setup>Open Connections</button></p>`;
}

function flagHtml(flag) {
  const cat = categoryById(flag.tx.category_id);
  return `<div class="item">
    <div class="item-text"><span class="item-title">${escapeHtml(formatMoney(flag.tx.amount_cents))} · ${escapeHtml(cat ? cat.name : '')} · ${escapeHtml(formatDay(flag.tx.occurred_on))}</span>
      <span class="item-sub">${escapeHtml(flag.reason)}</span></div>
    <div class="item-actions"><button type="button" class="small-btn" data-ok="${escapeHtml(flag.key)}">It's right</button>
      <button type="button" class="small-btn primary" data-open="${escapeHtml(flag.tx.id)}">Fix</button></div>
  </div>`;
}

function loggedHtml(tx) {
  const cat = categoryById(tx.category_id);
  return `<div class="item">
    <button type="button" class="item-text" data-open="${escapeHtml(tx.id)}" style="background:none;border:0;text-align:left;padding:0;cursor:pointer">
      <span class="item-title">${escapeHtml(tx.description || (cat ? cat.name : 'Expense'))} · ${escapeHtml(formatMoney(tx.amount_cents))}</span>
      <span class="item-sub">${escapeHtml(cat ? cat.name : '')} · ${escapeHtml(formatDay(tx.occurred_on))}</span></button>
    <div class="item-actions"><button type="button" class="small-btn" data-undo="${escapeHtml(tx.id)}">Undo</button></div>
  </div>`;
}

function letterHtml(note) {
  const when = note.month ? monthLabel(note.month) : formatDay(note.created_at.slice(0, 10));
  return `<details class="letter"><summary><span>${escapeHtml(note.title)}</span><span class="muted small">${escapeHtml(when)}</span></summary>
    <p>${escapeHtml(note.body)}</p></details>`;
}
