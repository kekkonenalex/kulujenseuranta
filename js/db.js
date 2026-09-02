// ============================================================
//  DATAKERROS - kaikki Supabase-kutsut kulkevat tasta tiedostosta.
//
//  Muu sovellus ei tiedä mitään Supabasesta. Jos tallennus joskus
//  vaihdetaan tai eteen lisataan offline-jono, muutokset osuvat
//  vain tahan tiedostoon.
// ============================================================

import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

const PAGE_SIZE = 1000; // Supabasen oletuskatto yhdelle vastaukselle

/** Virhe jonka viesti on tarkoitettu suoraan kayttajalle. */
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
  if (!isConfigured()) throw new AppError('Supabase-asetukset puuttuvat (js/config.js).', 'config');
  if (!window.supabase || typeof window.supabase.createClient !== 'function') {
    throw new AppError('Supabase-kirjastoa ei saatu ladattua. Tarkista verkkoyhteys ja lataa sivu uudelleen.', 'offline');
  }
  client = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      persistSession: true,     // sessio jaa localStorageen -> ei kirjautumista joka kerta
      autoRefreshToken: true,
      detectSessionInUrl: false,
    },
  });
  return client;
}

/* ------------------------------------------------------------
   Virheiden kaannos kayttajan kielelle
   ------------------------------------------------------------ */

function looksOffline(message) {
  return !navigator.onLine
    || /failed to fetch|networkerror|network request failed|load failed|timeout|fetch/i.test(message);
}

export function toAppError(error) {
  if (error instanceof AppError) return error;
  const message = String((error && error.message) || error || 'Tuntematon virhe');

  if (looksOffline(message)) {
    return new AppError('Ei verkkoyhteyttä – tietoja ei tallennettu. Yritä uudelleen kun verkko toimii.', 'offline');
  }
  if (/invalid login credentials/i.test(message)) {
    return new AppError('Sähköposti tai salasana ei täsmää.', 'auth');
  }
  if (/signup.?disabled|signups not allowed/i.test(message)) {
    return new AppError('Uusien tunnusten luonti on suljettu tässä projektissa. Kirjaudu olemassa olevalla tunnuksella.', 'auth');
  }
  if (/user already registered|already been registered/i.test(message)) {
    return new AppError('Tälle sähköpostille on jo tunnus. Kirjaudu sisään.', 'auth');
  }
  if (/password should be at least|weak.?password/i.test(message)) {
    return new AppError('Salasana on liian lyhyt tai heikko.', 'auth');
  }
  if (/email not confirmed/i.test(message)) {
    return new AppError('Sähköpostia ei ole vahvistettu. Avaa vahvistuslinkki sähköpostistasi.', 'auth');
  }
  if (/email address.*invalid|invalid email/i.test(message)) {
    return new AppError('Sähköpostiosoite ei ole kelvollinen.', 'auth');
  }
  if (/over_email_send_rate|rate limit|too many requests/i.test(message)) {
    return new AppError('Liian monta yritystä. Odota hetki ja yritä uudelleen.', 'auth');
  }
  if (/duplicate key|categories_user_name_uniq|unique constraint/i.test(message)) {
    return new AppError('Samanniminen kategoria on jo olemassa.', 'conflict');
  }
  if (/still referenced|violates foreign key|update or delete on table "categories"/i.test(message)) {
    return new AppError('Kategoriaa ei voi poistaa, koska sillä on kirjauksia. Arkistoi se tai siirrä kirjaukset toiseen kategoriaan.', 'conflict');
  }
  if (/row-level security|permission denied|jwt|not authorized/i.test(message)) {
    return new AppError('Tietokanta esti toiminnon. Tarkista että supabase-schema.sql on ajettu ja että olet kirjautunut.', 'db');
  }
  if (/relation .* does not exist|could not find the table/i.test(message)) {
    return new AppError('Tietokannan taulut puuttuvat. Aja supabase-schema.sql Supabasen SQL Editorissa.', 'db');
  }
  return new AppError(message, 'unknown');
}

/** Kaikki kutsut kaytavat taman lapi: heittaa aina AppErrorin. */
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

/* ------------------------------------------------------------
   Autentikointi
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
  const data = await run(getClient().auth.signInWithPassword({
    email: String(email).trim(),
    password,
  }));
  return data;
}

/**
 * Luo tunnuksen. Jos Supabase-projektissa on sahkopostivahvistus
 * paalla, session on null ja kayttajan pitaa avata vahvistuslinkki.
 */
export async function signUp(email, password) {
  const data = await run(getClient().auth.signUp({
    email: String(email).trim(),
    password,
  }));
  return { user: data && data.user, session: data && data.session };
}

export async function signOut() {
  await run(getClient().auth.signOut());
}

async function requireUserId() {
  const session = await getSession();
  if (!session || !session.user) throw new AppError('Kirjautuminen on vanhentunut. Kirjaudu uudelleen.', 'auth');
  return session.user.id;
}

/* ------------------------------------------------------------
   Kategoriat
   ------------------------------------------------------------ */

export async function fetchCategories() {
  const data = await run(getClient()
    .from('categories')
    .select('id, name, color, sort_order, archived, created_at')
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true }));
  return data || [];
}

export async function createCategory({ name, color, sortOrder }) {
  const userId = await requireUserId();
  const data = await run(getClient()
    .from('categories')
    .insert({
      user_id: userId,
      name: String(name).trim(),
      color: color || '#6366f1',
      sort_order: Number.isFinite(sortOrder) ? sortOrder : 0,
    })
    .select('id, name, color, sort_order, archived, created_at')
    .single());
  return data;
}

export async function updateCategory(id, patch) {
  const allowed = {};
  if (patch.name !== undefined) allowed.name = String(patch.name).trim();
  if (patch.color !== undefined) allowed.color = patch.color;
  if (patch.archived !== undefined) allowed.archived = Boolean(patch.archived);
  if (patch.sortOrder !== undefined) allowed.sort_order = patch.sortOrder;

  const data = await run(getClient()
    .from('categories')
    .update(allowed)
    .eq('id', id)
    .select('id, name, color, sort_order, archived, created_at')
    .single());
  return data;
}

export async function deleteCategory(id) {
  await run(getClient().from('categories').delete().eq('id', id));
}

/* ------------------------------------------------------------
   Transaktiot
   ------------------------------------------------------------ */

/** Hakee kaikki transaktiot sivuttamalla (Supabase palauttaa max 1000/kutsu). */
export async function fetchTransactions() {
  const rows = [];
  for (let page = 0; ; page += 1) {
    const from = page * PAGE_SIZE;
    const data = await run(getClient()
      .from('transactions')
      .select('id, category_id, amount_cents, occurred_on, description, created_at, updated_at')
      .order('occurred_on', { ascending: false })
      .order('created_at', { ascending: false })
      .range(from, from + PAGE_SIZE - 1));
    const batch = data || [];
    rows.push(...batch);
    if (batch.length < PAGE_SIZE) break;
    if (page > 200) break; // turvaraja
  }
  return rows;
}

export async function createTransaction({ categoryId, amountCents, occurredOn, description }) {
  const userId = await requireUserId();
  const data = await run(getClient()
    .from('transactions')
    .insert({
      user_id: userId,
      category_id: categoryId,
      amount_cents: amountCents,
      occurred_on: occurredOn,
      description: description ? String(description).trim() : null,
    })
    .select('id, category_id, amount_cents, occurred_on, description, created_at, updated_at')
    .single());
  return data;
}

export async function updateTransaction(id, patch) {
  const allowed = {};
  if (patch.categoryId !== undefined) allowed.category_id = patch.categoryId;
  if (patch.amountCents !== undefined) allowed.amount_cents = patch.amountCents;
  if (patch.occurredOn !== undefined) allowed.occurred_on = patch.occurredOn;
  if (patch.description !== undefined) {
    allowed.description = patch.description ? String(patch.description).trim() : null;
  }
  const data = await run(getClient()
    .from('transactions')
    .update(allowed)
    .eq('id', id)
    .select('id, category_id, amount_cents, occurred_on, description, created_at, updated_at')
    .single());
  return data;
}

export async function deleteTransaction(id) {
  await run(getClient().from('transactions').delete().eq('id', id));
}

/* ------------------------------------------------------------
   Varmuuskopion tuonti
   ------------------------------------------------------------ */

/**
 * Tuo kategoriat ja transaktiot varmuuskopiosta.
 * Olemassa olevaa dataa ei poisteta: samannimiset kategoriat
 * yhdistetaan ja niiden transaktiot lisataan.
 */
export async function importBackup({ categories = [], transactions = [] }) {
  const userId = await requireUserId();
  const existing = await fetchCategories();

  const keyOf = (name) => String(name || '').trim().toLowerCase();
  const idMap = new Map();                       // varmuuskopion id -> tietokannan id
  const byName = new Map(existing.map((c) => [keyOf(c.name), c]));

  let createdCategories = 0;
  for (const cat of categories) {
    const key = keyOf(cat.name);
    if (!key) continue;
    if (byName.has(key)) {
      idMap.set(cat.id, byName.get(key).id);
      continue;
    }
    const created = await createCategory({
      name: cat.name,
      color: cat.color || '#6366f1',
      sortOrder: Number.isFinite(cat.sort_order) ? cat.sort_order : 0,
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
    if (!categoryId || !Number.isFinite(cents) || cents <= 0 || !tx.occurred_on) {
      skipped += 1;
      continue;
    }
    rows.push({
      user_id: userId,
      category_id: categoryId,
      amount_cents: cents,
      occurred_on: tx.occurred_on,
      description: tx.description ? String(tx.description) : null,
    });
  }

  const CHUNK = 400;
  let inserted = 0;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);
    await run(getClient().from('transactions').insert(chunk));
    inserted += chunk.length;
  }

  return { createdCategories, inserted, skipped };
}
