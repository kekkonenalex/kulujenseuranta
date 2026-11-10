// ============================================================
//  The data layer: every Supabase call goes through this file. The rest of the app knows nothing of
//  Supabase. Row Level Security decides what the signed-in user may read and write; nothing here
//  holds a key that could bypass it.
// ============================================================

import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

const PAGE_SIZE = 1000; // Supabase's cap for one answer

/** An error whose message is meant for the person using the app. */
export class AppError extends Error {
  constructor(message, kind = 'unknown') {
    super(message);
    this.name = 'AppError';
    this.kind = kind;
  }
}

export function isConfigured() {
  return Boolean(SUPABASE_URL && SUPABASE_ANON_KEY
    && SUPABASE_URL.startsWith('http')
    && SUPABASE_ANON_KEY.length > 20);
}

let client = null;

export function getClient() {
  if (client) return client;
  if (!isConfigured()) throw new AppError('The Supabase settings are missing (js/config.js).', 'config');
  if (!window.supabase || typeof window.supabase.createClient !== 'function') {
    throw new AppError("The database library didn't load. Check the connection and open the app again.", 'offline');
  }
  client = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
  });
  return client;
}

/* ------------------------------------------------------------
   Errors, in plain words
   ------------------------------------------------------------ */

function looksOffline(message) {
  return !navigator.onLine
    || /failed to fetch|networkerror|network request failed|load failed|timeout/i.test(message);
}

export function toAppError(error) {
  if (error instanceof AppError) return error;
  const message = String((error && error.message) || error || 'Something went wrong');

  if (looksOffline(message)) {
    return new AppError("No connection, so nothing was saved. Try again when you're online.", 'offline');
  }
  if (/invalid login credentials/i.test(message)) return new AppError("That email and password don't match.", 'auth');
  if (/email not confirmed/i.test(message)) return new AppError("The email isn't confirmed yet: open the link in your inbox.", 'auth');
  if (/rate limit|too many requests|over_email_send_rate/i.test(message)) {
    return new AppError('Too many tries. Wait a moment and try again.', 'auth');
  }
  if (/categories_user_name_uniq|duplicate key|unique constraint/i.test(message)) {
    return new AppError('There is a category with that name already.', 'conflict');
  }
  if (/still referenced|violates foreign key|update or delete on table "categories"/i.test(message)) {
    return new AppError('That category has expenses, so it can only be archived.', 'conflict');
  }
  if (/categories_color_format/i.test(message)) return new AppError('A colour is written like #f5b544.', 'invalid');
  if (/_length|value too long/i.test(message)) return new AppError("That's too long.", 'invalid');
  if (/row-level security|permission denied|jwt|not authorized/i.test(message)) {
    return new AppError("The database refused that. You may have been signed out: sign in again.", 'db');
  }
  if (/relation .* does not exist|could not find the table|schema cache/i.test(message)) {
    return new AppError("The database doesn't have this part yet: paste sql/build1.sql in Supabase's SQL Editor.", 'db');
  }
  return new AppError(message, 'unknown');
}

/** Every call goes through here: it always throws an AppError. */
async function run(promiseLike) {
  let result;
  try {
    result = await promiseLike;
  } catch (err) {
    throw toAppError(err);
  }
  if (result && result.error) throw toAppError(result.error);
  return result ? result.data : null;
}

/** A table the database may not have yet (before build1.sql): empty, not an error. */
async function optional(promiseLike) {
  try {
    return (await run(promiseLike)) || [];
  } catch (err) {
    if (err.kind === 'db' && /SQL Editor/.test(err.message)) return null;
    throw err;
  }
}

/* ------------------------------------------------------------
   Signing in
   ------------------------------------------------------------ */

export async function getSession() {
  const data = await run(getClient().auth.getSession());
  return (data && data.session) || null;
}

export function onAuthChange(handler) {
  const { data } = getClient().auth.onAuthStateChange((event, session) => handler(event, session));
  return () => data.subscription.unsubscribe();
}

export async function signIn(email, password) {
  return run(getClient().auth.signInWithPassword({ email: String(email).trim(), password }));
}

export async function signOut() {
  await run(getClient().auth.signOut());
}

async function requireUserId() {
  const session = await getSession();
  if (!session || !session.user) throw new AppError('You were signed out. Sign in again.', 'auth');
  return session.user.id;
}

/* ------------------------------------------------------------
   Categories
   ------------------------------------------------------------ */

const CATEGORY_COLUMNS = 'id, name, color, sort_order, archived, ask_description, created_at';

export async function fetchCategories() {
  return (await run(getClient().from('categories').select(CATEGORY_COLUMNS)
    .order('sort_order', { ascending: true }).order('created_at', { ascending: true }))) || [];
}

export async function createCategory({ name, color, sortOrder, askDescription = false }) {
  const userId = await requireUserId();
  return run(getClient().from('categories').insert({
    user_id: userId,
    name: String(name).trim(),
    color: color || '#f5b544',
    sort_order: Number.isFinite(sortOrder) ? sortOrder : 0,
    ask_description: Boolean(askDescription),
  }).select(CATEGORY_COLUMNS).single());
}

export async function updateCategory(id, patch) {
  const allowed = {};
  if (patch.name !== undefined) allowed.name = String(patch.name).trim();
  if (patch.color !== undefined) allowed.color = patch.color;
  if (patch.archived !== undefined) allowed.archived = Boolean(patch.archived);
  if (patch.sortOrder !== undefined) allowed.sort_order = patch.sortOrder;
  if (patch.askDescription !== undefined) allowed.ask_description = Boolean(patch.askDescription);
  return run(getClient().from('categories').update(allowed).eq('id', id).select(CATEGORY_COLUMNS).single());
}

export async function deleteCategory(id) {
  await run(getClient().from('categories').delete().eq('id', id));
}

/* ------------------------------------------------------------
   Expenses (the table is still called transactions)
   ------------------------------------------------------------ */

const TX_COLUMNS = 'id, category_id, amount_cents, occurred_on, description, created_at, updated_at, device_token_id';

/** Every expense, a page at a time (Supabase gives at most 1000 per answer). */
export async function fetchTransactions() {
  const rows = [];
  for (let page = 0; page < 200; page += 1) {
    const from = page * PAGE_SIZE;
    const batch = (await run(getClient().from('transactions').select(TX_COLUMNS)
      .order('occurred_on', { ascending: false }).order('created_at', { ascending: false })
      .range(from, from + PAGE_SIZE - 1))) || [];
    rows.push(...batch);
    if (batch.length < PAGE_SIZE) break;
  }
  return rows;
}

export async function createTransaction({ categoryId, amountCents, occurredOn, description, deviceTokenId = null }) {
  const userId = await requireUserId();
  const row = {
    user_id: userId,
    category_id: categoryId,
    amount_cents: amountCents,
    occurred_on: occurredOn,
    description: description ? String(description).trim().slice(0, 300) : null,
  };
  if (deviceTokenId) row.device_token_id = deviceTokenId; // (putting back one Otso logged: it stays Otso's)
  return run(getClient().from('transactions').insert(row).select(TX_COLUMNS).single());
}

export async function updateTransaction(id, patch) {
  const allowed = {};
  if (patch.categoryId !== undefined) allowed.category_id = patch.categoryId;
  if (patch.amountCents !== undefined) allowed.amount_cents = patch.amountCents;
  if (patch.occurredOn !== undefined) allowed.occurred_on = patch.occurredOn;
  if (patch.description !== undefined) {
    allowed.description = patch.description ? String(patch.description).trim().slice(0, 300) : null;
  }
  return run(getClient().from('transactions').update(allowed).eq('id', id).select(TX_COLUMNS).single());
}

export async function deleteTransaction(id) {
  await run(getClient().from('transactions').delete().eq('id', id));
}

/* ------------------------------------------------------------
   Budgets: year_month null is the budget for every month; 'YYYY-MM' is that month's own.
   ------------------------------------------------------------ */

const BUDGET_COLUMNS = 'id, category_id, year_month, amount_cents';

export async function fetchBudgets() {
  return (await run(getClient().from('budgets').select(BUDGET_COLUMNS))) || [];
}

export async function saveBudget({ id = null, categoryId, yearMonth = null, amountCents }) {
  if (id) {
    return run(getClient().from('budgets').update({ amount_cents: amountCents }).eq('id', id)
      .select(BUDGET_COLUMNS).single());
  }
  const userId = await requireUserId();
  return run(getClient().from('budgets').insert({
    user_id: userId, category_id: categoryId, year_month: yearMonth, amount_cents: amountCents,
  }).select(BUDGET_COLUMNS).single());
}

export async function deleteBudget(id) {
  await run(getClient().from('budgets').delete().eq('id', id));
}

/* ------------------------------------------------------------
   Income and paydays (build1.sql). null when the database doesn't have them yet.
   ------------------------------------------------------------ */

const INCOME_COLUMNS = 'id, amount_cents, received_on, source, note, payday_id, created_at';
const PAYDAY_COLUMNS = 'id, name, amount_cents, day_of_month, starts_on, ends_on, created_at';

export async function fetchIncome() {
  return optional(getClient().from('income').select(INCOME_COLUMNS).order('received_on', { ascending: false }));
}

export async function fetchPaydays() {
  return optional(getClient().from('paydays').select(PAYDAY_COLUMNS).order('day_of_month', { ascending: true }));
}

export async function saveIncome({ id = null, amountCents, receivedOn, source, note = null, paydayId = null }) {
  const row = {
    amount_cents: amountCents, received_on: receivedOn, source: String(source).trim().slice(0, 60),
    note: note ? String(note).trim().slice(0, 300) : null, payday_id: paydayId,
  };
  if (id) return run(getClient().from('income').update(row).eq('id', id).select(INCOME_COLUMNS).single());
  return run(getClient().from('income').insert({ user_id: await requireUserId(), ...row }).select(INCOME_COLUMNS).single());
}

export async function deleteIncome(id) {
  await run(getClient().from('income').delete().eq('id', id));
}

export async function savePayday({ id = null, name, amountCents, dayOfMonth, startsOn, endsOn = null }) {
  const row = {
    name: String(name).trim().slice(0, 60), amount_cents: amountCents, day_of_month: dayOfMonth,
    starts_on: startsOn, ends_on: endsOn,
  };
  if (id) return run(getClient().from('paydays').update(row).eq('id', id).select(PAYDAY_COLUMNS).single());
  return run(getClient().from('paydays').insert({ user_id: await requireUserId(), ...row }).select(PAYDAY_COLUMNS).single());
}

export async function deletePayday(id) {
  await run(getClient().from('paydays').delete().eq('id', id));
}

/* ------------------------------------------------------------
   Otso's notes (build1.sql): Otso writes them with its token; here they're read, dismissed, deleted.
   ------------------------------------------------------------ */

const NOTE_COLUMNS = 'id, key, kind, title, body, month, valid_until, dismissed_at, created_at, updated_at';

export async function fetchNotes() {
  return optional(getClient().from('otso_notes').select(NOTE_COLUMNS).order('updated_at', { ascending: false }));
}

export async function dismissNote(id) {
  return run(getClient().from('otso_notes').update({ dismissed_at: new Date().toISOString() }).eq('id', id)
    .select(NOTE_COLUMNS).single());
}

export async function deleteNote(id) {
  await run(getClient().from('otso_notes').delete().eq('id', id));
}

/* ------------------------------------------------------------
   Device tokens (the iPhone Shortcut, Otso). Only the token's SHA-256 is stored; the token itself is
   made in the browser, shown once and forgotten.
   ------------------------------------------------------------ */

const TOKEN_COLUMNS = 'id, name, created_at, last_used_at, can_read';
let tokenColumns = `${TOKEN_COLUMNS}, can_note`;

export async function fetchDeviceTokens() {
  try {
    return (await run(getClient().from('device_tokens').select(tokenColumns)
      .order('created_at', { ascending: false }))) || [];
  } catch (err) {
    if (tokenColumns === TOKEN_COLUMNS || err.kind !== 'unknown') throw err;
    tokenColumns = TOKEN_COLUMNS; // (before build1.sql there's no can_note)
    return fetchDeviceTokens();
  }
}

export async function createDeviceToken({ name, tokenHash, canRead = false, canNote = false }) {
  const row = { user_id: await requireUserId(), name: String(name).trim().slice(0, 60) || 'iPhone', token_hash: tokenHash };
  if (canRead) row.can_read = true;
  if (canNote) row.can_note = true;
  return run(getClient().from('device_tokens').insert(row).select(tokenColumns).single());
}

/** Rename a token, or switch what it may do (build1.sql adds the update policy). */
export async function updateDeviceToken(id, { name, canRead, canNote }) {
  const patch = {};
  if (name !== undefined) patch.name = String(name).trim().slice(0, 60) || 'iPhone';
  if (canRead !== undefined) patch.can_read = Boolean(canRead);
  if (canNote !== undefined) patch.can_note = Boolean(canNote);
  const data = await run(getClient().from('device_tokens').update(patch).eq('id', id).select(tokenColumns));
  if (!data || !data.length) {
    throw new AppError("The token couldn't be changed: paste sql/build1.sql in Supabase's SQL Editor first.", 'db');
  }
  return data[0];
}

export async function deleteDeviceToken(id) {
  await run(getClient().from('device_tokens').delete().eq('id', id));
}

/* ------------------------------------------------------------
   Restoring a backup: nothing is deleted. Categories with the same name are merged and their
   expenses added; importing the same file twice adds its expenses twice.
   ------------------------------------------------------------ */

export async function importBackup({ categories = [], transactions = [], budgets = [] }) {
  const userId = await requireUserId();
  const existing = await fetchCategories();
  const keyOf = (name) => String(name || '').trim().toLowerCase();
  const idMap = new Map();
  const byName = new Map(existing.map((c) => [keyOf(c.name), c]));

  let createdCategories = 0;
  for (const cat of categories) {
    const key = keyOf(cat.name);
    if (!key) continue;
    if (byName.has(key)) { idMap.set(cat.id, byName.get(key).id); continue; }
    const created = await createCategory({
      name: cat.name, color: /^#[0-9a-f]{6}$/i.test(cat.color || '') ? cat.color : '#f5b544',
      sortOrder: Number.isFinite(cat.sort_order) ? cat.sort_order : 0, askDescription: cat.ask_description === true,
    });
    byName.set(key, created);
    idMap.set(cat.id, created.id);
    createdCategories += 1;
  }

  const rows = [];
  let skipped = 0;
  for (const tx of transactions) {
    const categoryId = idMap.get(tx.category_id);
    const cents = Math.round(Number(tx.amount_cents));
    if (!categoryId || !Number.isFinite(cents) || cents <= 0 || !tx.occurred_on) { skipped += 1; continue; }
    rows.push({
      user_id: userId, category_id: categoryId, amount_cents: cents, occurred_on: tx.occurred_on,
      description: tx.description ? String(tx.description).slice(0, 300) : null,
    });
  }
  let inserted = 0;
  for (let i = 0; i < rows.length; i += 400) {
    const chunk = rows.slice(i, i + 400);
    await run(getClient().from('transactions').insert(chunk));
    inserted += chunk.length;
  }

  const existingBudgets = await fetchBudgets();
  const budgetKey = (categoryId, yearMonth) => `${categoryId}|${yearMonth || ''}`;
  const haveBudget = new Set(existingBudgets.map((b) => budgetKey(b.category_id, b.year_month)));
  let budgetsAdded = 0;
  for (const budget of budgets) {
    const categoryId = idMap.get(budget.category_id);
    const cents = Math.round(Number(budget.amount_cents));
    if (!categoryId || !Number.isFinite(cents) || cents < 0) continue;
    if (haveBudget.has(budgetKey(categoryId, budget.year_month))) continue;
    await saveBudget({ categoryId, yearMonth: budget.year_month || null, amountCents: cents });
    haveBudget.add(budgetKey(categoryId, budget.year_month));
    budgetsAdded += 1;
  }
  return { createdCategories, inserted, skipped, budgetsAdded };
}
