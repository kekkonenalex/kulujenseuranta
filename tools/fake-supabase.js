// A fake Supabase client for tools/preview.html: the calls js/db.js makes, on example data in memory.
// Example data only (not anyone's real spending). Today is whatever the computer says.
(function () {
  const pad = (n) => String(n).padStart(2, '0');
  const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const today = new Date();
  const day = (offset) => { const d = new Date(today); d.setDate(d.getDate() + offset); return iso(d); };
  const uid = () => Math.random().toString(16).slice(2) + Math.random().toString(16).slice(2);
  const user = { id: 'user-1', email: 'example@example.com' };

  const cats = [
    ['Ruokakauppa', '#f5b544'], ['Ravintolat', '#d9772f'], ['Kahvi ja välipalat', '#e8d5a8'],
    ['Julkinen liikenne', '#8fa3ad'], ['Energiajuomat', '#b4532a'], ['Viihde', '#7d8f6a'],
  ].map(([name, color], i) => ({ id: `c${i}`, name, color, sort_order: (i + 1) * 10, archived: false, ask_description: i === 1, created_at: '2026-09-01T10:00:00Z' }));
  const tokens = [
    { id: 't-iphone', name: 'iPhone', created_at: '2026-09-20T10:00:00Z', last_used_at: day(-1) + 'T08:00:00Z', can_read: false, can_note: false },
    { id: 't-otso', name: 'Otso', created_at: '2026-10-02T10:00:00Z', last_used_at: day(0) + 'T08:12:00Z', can_read: true, can_note: true },
  ];
  // About four months of expenses: groceries twice a week, coffee most days, lunches, the bus.
  const txs = [];
  let seed = 7;
  const rand = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };
  for (let back = 120; back >= -2; back -= 1) {
    const on = day(-back);
    const add = (c, cents, desc, token = null) => txs.push({ id: uid(), category_id: `c${c}`, amount_cents: cents, occurred_on: on, description: desc, created_at: on + 'T12:00:00Z', updated_at: on + 'T12:00:00Z', device_token_id: token });
    if (back < 0) { if (back === -2) add(5, 2400, 'Concert ticket'); continue; }
    if (back % 3 === 0) add(0, 1800 + Math.round(rand() * 3200), rand() > 0.5 ? 'Prisma Kamppi' : 'K-Market', rand() > 0.4 ? 't-otso' : null);
    if (rand() > 0.35) add(2, 250 + Math.round(rand() * 300), 'Unicafe', 't-otso');
    if (rand() > 0.7) add(1, 1100 + Math.round(rand() * 1600), rand() > 0.5 ? 'Wolt' : 'Lunch, Kamppi', 't-iphone');
    if (back % 30 === 3) add(3, 6400, 'HSL month ticket');
    if (rand() > 0.82) add(4, 199 + Math.round(rand() * 150), 'Energy drink', 't-otso');
  }
  // A double (Apple Pay through Otso, and by hand) and an odd one, for the flags.
  txs.push({ id: uid(), category_id: 'c0', amount_cents: 2348, occurred_on: day(-1), description: 'Prisma', created_at: day(-1) + 'T17:00:00Z', updated_at: day(-1) + 'T17:00:00Z', device_token_id: 't-otso' });
  txs.push({ id: uid(), category_id: 'c0', amount_cents: 2348, occurred_on: day(-1), description: '', created_at: day(-1) + 'T18:00:00Z', updated_at: day(-1) + 'T18:00:00Z', device_token_id: null });
  txs.push({ id: uid(), category_id: 'c2', amount_cents: 3150, occurred_on: day(-3), description: 'Café, with friends', created_at: day(-3) + 'T15:00:00Z', updated_at: day(-3) + 'T15:00:00Z', device_token_id: null });
  const month = iso(today).slice(0, 7);
  const prevMonth = iso(new Date(today.getFullYear(), today.getMonth() - 1, 1)).slice(0, 7);
  const tables = {
    categories: cats,
    transactions: txs,
    budgets: [['c0', 30000], ['c1', 12000], ['c2', 6000], ['c3', 6400], ['c4', 2000]].map(([c, cents], i) => ({ id: `b${i}`, category_id: c, year_month: null, amount_cents: cents })),
    device_tokens: tokens,
    monthly_budgets: [{ id: 'mb1', year_month: null, amount_cents: 90000 }],
    income: [{ id: 'i1', amount_cents: 26800, received_on: `${month}-05`, source: 'Part-time work', note: null, payday_id: null, created_at: `${month}-05T10:00:00Z` }],
    paydays: [{ id: 'p1', name: 'Study grant', amount_cents: 27983, day_of_month: 5, starts_on: '2026-09-01', ends_on: null, created_at: '2026-09-01T10:00:00Z' },
      { id: 'p2', name: 'Salary', amount_cents: 61000, day_of_month: 15, starts_on: '2026-09-01', ends_on: null, created_at: '2026-09-01T10:00:00Z' }],
    otso_notes: [
      { id: 'n1', key: 'read', kind: 'read', title: 'Energiajuomat is over its budget', body: 'Energiajuomat is over its budget: 24,10 € of 20,00 €, 4,10 € over with 21 days to go.', month, valid_until: null, dismissed_at: null, created_at: day(0) + 'T07:00:00Z', updated_at: day(0) + 'T07:00:00Z' },
      { id: 'n2', key: `letter:${prevMonth}`, kind: 'letter', title: `${['January','February','March','April','May','June','July','August','September','October','November','December'][Number(prevMonth.slice(5)) - 1]} in money`, body: 'You spent 642 € against a budget of 584 €. Groceries carried most of it, two big runs in the last week. Coffee stayed under. One suggestion for this month: plan the Friday shop.', month: prevMonth, valid_until: null, dismissed_at: null, created_at: `${month}-01T09:00:00Z`, updated_at: `${month}-01T09:00:00Z` },
    ],
  };

  function builder(table) {
    const q = { table, op: 'select', filters: [], payload: null, single: false, range: null, order: [] };
    const api = {
      select() { return api; },
      order(col, opts) { q.order.push([col, opts && opts.ascending === false ? -1 : 1]); return api; },
      range(a, b) { q.range = [a, b]; return api; },
      eq(col, val) { q.filters.push([col, val]); return api; },
      insert(rows) { q.op = 'insert'; q.payload = rows; return api; },
      update(patch) { q.op = 'update'; q.payload = patch; return api; },
      delete() { q.op = 'delete'; return api; },
      single() { q.single = true; return api; },
      then(resolve, reject) { return Promise.resolve().then(() => run(q)).then(resolve, reject); },
    };
    return api;
  }

  function run(q) {
    const rows = tables[q.table];
    const match = (r) => q.filters.every(([c, v]) => r[c] === v);
    let data;
    if (q.op === 'select') {
      data = rows.slice();
      for (const [col, dir] of q.order.slice().reverse()) data.sort((a, b) => (a[col] < b[col] ? -dir : a[col] > b[col] ? dir : 0));
      if (q.range) data = data.slice(q.range[0], q.range[1] + 1);
    } else if (q.op === 'insert') {
      const list = (Array.isArray(q.payload) ? q.payload : [q.payload]).map((r) => ({ id: uid(), created_at: new Date().toISOString(), updated_at: new Date().toISOString(), dismissed_at: null, device_token_id: null, ...r }));
      rows.push(...list);
      data = list;
    } else if (q.op === 'update') {
      data = rows.filter(match);
      data.forEach((r) => Object.assign(r, q.payload, { updated_at: new Date().toISOString() }));
    } else {
      data = rows.filter(match);
      tables[q.table] = rows.filter((r) => !match(r));
    }
    return { data: q.single ? (data[0] || null) : data, error: null };
  }

  let session = { user };
  window.supabase = {
    createClient() {
      return {
        auth: {
          getSession: async () => ({ data: { session }, error: null }),
          onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
          signInWithPassword: async () => { session = { user }; return { data: { session }, error: null }; },
          signOut: async () => { session = null; return { error: null }; },
        },
        from: builder,
      };
    },
  };
})();
