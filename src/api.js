/**
 * api.js — all REST endpoints for the pharmacy website
 * Run behind server.js:  node server.js
 */
const db = require('./db');
const { hashPassword, verifyPassword, createSession, destroySession } = require('./auth');

const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
const nowISO = () => new Date().toISOString();

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
const bad = (msg) => new HttpError(400, msg);
const unauthorized = (msg = 'Please login first') => new HttpError(401, msg);
const forbidden = (msg = 'Admin access only') => new HttpError(403, msg);
const notFound = (msg = 'Not found') => new HttpError(404, msg);

function needAuth(ctx) {
  if (!ctx.user) throw unauthorized();
  return ctx.user;
}
function needAdmin(ctx) {
  if (!ctx.user) throw unauthorized();
  if (ctx.user.role !== 'admin') throw forbidden();
  return ctx.user;
}
function str(v, field, { required = true, min = 1 } = {}) {
  const s = String(v ?? '').trim();
  if (required && s.length < min) throw bad(`${field} is required`);
  return s;
}
function num(v, field, { min = 0 } = {}) {
  const n = Number(v);
  if (!Number.isFinite(n) || n < min) throw bad(`${field} must be a number ≥ ${min}`);
  return n;
}

/* ============================================================
 *  LEDGER  (credit / debit register — the "khata")
 * ============================================================ */
/**
 * partyType: 'customer'  -> credit = sale on udhaar (customer owes), debit = payment received
 * partyType: 'supplier'  -> debit  = goods bought on credit (shop owes), credit = payment paid
 */
function addLedgerEntry(entry) {
  return db.insert('ledger', {
    date: entry.date || nowISO(),
    partyType: entry.partyType,
    partyId: entry.partyId ?? null,
    partyName: entry.partyName,
    type: entry.type, // 'credit' | 'debit'
    amount: round2(entry.amount),
    mode: entry.mode || 'credit',
    note: entry.note || '',
    refType: entry.refType || 'manual',
    refId: entry.refId ?? null,
  });
}

function customerBalance(userId, partyName) {
  const rows = db.read('ledger').filter(
    (e) =>
      e.partyType === 'customer' &&
      ((userId != null && e.partyId === Number(userId)) ||
        (!userId && partyName && e.partyName === partyName))
  );
  const credit = rows.filter((e) => e.type === 'credit').reduce((s, e) => s + e.amount, 0);
  const debit = rows.filter((e) => e.type === 'debit').reduce((s, e) => s + e.amount, 0);
  return { credit: round2(credit), debit: round2(debit), balance: round2(credit - debit) };
}

function supplierBalance(name) {
  const rows = db.read('ledger').filter(
    (e) => e.partyType === 'supplier' && e.partyName === name
  );
  const debit = rows.filter((e) => e.type === 'debit').reduce((s, e) => s + e.amount, 0);
  const credit = rows.filter((e) => e.type === 'credit').reduce((s, e) => s + e.amount, 0);
  return { debit: round2(debit), credit: round2(credit), balance: round2(debit - credit) };
}

/* ============================================================
 *  ROUTES
 * ============================================================ */
const routes = [];
const route = (method, pattern, handler) => routes.push({ method, parts: pattern.split('/').filter(Boolean), handler });

function matchRoute(method, pathname) {
  const parts = pathname.split('/').filter(Boolean);
  for (const r of routes) {
    if (r.method !== method || r.parts.length !== parts.length) continue;
    const params = {};
    let ok = true;
    for (let i = 0; i < r.parts.length; i++) {
      if (r.parts[i].startsWith(':')) params[r.parts[i].slice(1)] = decodeURIComponent(parts[i]);
      else if (r.parts[i] !== parts[i]) { ok = false; break; }
    }
    if (ok) return { handler: r.handler, params };
  }
  return null;
}

/* ---------------- AUTH ---------------- */
route('POST', '/api/auth/register', (ctx) => {
  const name = str(ctx.body.name, 'Name', { min: 2 });
  const email = str(ctx.body.email, 'Email', { min: 5 }).toLowerCase();
  const phone = str(ctx.body.phone, 'Phone', { min: 10 });
  const password = str(ctx.body.password, 'Password', { min: 6 });
  const address = str(ctx.body.address, 'Address', { required: false });

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw bad('Enter a valid email address');
  const users = db.read('users');
  if (users.some((u) => u.email.toLowerCase() === email)) throw bad('This email is already registered');

  const user = db.insert('users', {
    name,
    email,
    phone,
    passwordHash: hashPassword(password),
    role: 'customer',
    address,
  });
  const token = createSession(ctx.req, ctx.res, user);
  return { status: 201, body: { user: require('./auth').publicUser(user), token } };
});

route('POST', '/api/auth/login', (ctx) => {
  const email = str(ctx.body.email, 'Email').toLowerCase();
  const password = str(ctx.body.password, 'Password');
  const user = db.read('users').find((u) => u.email.toLowerCase() === email);
  if (!user || !verifyPassword(password, user.passwordHash)) {
    throw new HttpError(401, 'Invalid email or password');
  }
  const token = createSession(ctx.req, ctx.res, user);
  return { status: 200, body: { user: require('./auth').publicUser(user), token } };
});

route('POST', '/api/auth/logout', (ctx) => {
  destroySession(ctx.req, ctx.res);
  return { status: 200, body: { ok: true } };
});

route('GET', '/api/auth/me', (ctx) => ({ status: 200, body: { user: ctx.user } }));

route('PUT', '/api/auth/profile', (ctx) => {
  const user = needAuth(ctx);
  const patch = {};
  ['name', 'phone', 'address'].forEach((f) => {
    if (ctx.body[f] !== undefined) patch[f] = String(ctx.body[f]).trim();
  });
  if (ctx.body.password) patch.passwordHash = hashPassword(str(ctx.body.password, 'Password', { min: 6 }));
  const updated = db.update('users', user.id, patch);
  return { status: 200, body: { user: require('./auth').publicUser(updated) } };
});

/* ---------------- PRODUCTS ---------------- */
route('GET', '/api/products', (ctx) => {
  const q = (ctx.url.searchParams.get('q') || '').toLowerCase().trim();
  const category = (ctx.url.searchParams.get('category') || '').toLowerCase().trim();
  let rows = db.read('products');
  if (q) rows = rows.filter((p) => `${p.name} ${p.brand} ${p.category}`.toLowerCase().includes(q));
  if (category && category !== 'all') rows = rows.filter((p) => p.category.toLowerCase() === category);
  return { status: 200, body: { products: rows.sort((a, b) => a.name.localeCompare(b.name)) } };
});

route('GET', '/api/products/:id', (ctx) => {
  const p = db.read('products').find((x) => x.id === Number(ctx.params.id));
  if (!p) throw notFound('Medicine not found');
  return { status: 200, body: { product: p } };
});

route('POST', '/api/admin/products', (ctx) => {
  needAdmin(ctx);
  const product = db.insert('products', {
    name: str(ctx.body.name, 'Medicine name', { min: 2 }),
    brand: str(ctx.body.brand, 'Brand', { required: false }),
    category: str(ctx.body.category, 'Category', { required: false }) || 'Tablet',
    price: num(ctx.body.price, 'Selling price'),
    mrp: num(ctx.body.mrp ?? ctx.body.price, 'MRP'),
    stock: num(ctx.body.stock ?? 0, 'Stock'),
    packSize: str(ctx.body.packSize, 'Pack size', { required: false }) || '-',
    prescription: Boolean(ctx.body.prescription),
  });
  return { status: 201, body: { product } };
});

route('PUT', '/api/admin/products/:id', (ctx) => {
  needAdmin(ctx);
  const id = Number(ctx.params.id);
  const patch = { ...ctx.body };
  delete patch.id;
  ['price', 'mrp', 'stock'].forEach((f) => {
    if (patch[f] !== undefined) patch[f] = num(patch[f], f);
  });
  const product = db.update('products', id, patch);
  if (!product) throw notFound('Medicine not found');
  return { status: 200, body: { product } };
});

route('DELETE', '/api/admin/products/:id', (ctx) => {
  needAdmin(ctx);
  const ok = db.remove('products', Number(ctx.params.id));
  if (!ok) throw notFound('Medicine not found');
  return { status: 200, body: { ok: true } };
});

/* ---------------- ONLINE ORDERS (customer purchases) ---------------- */
function buildItems(rawItems) {
  if (!Array.isArray(rawItems) || rawItems.length === 0) throw bad('Cart is empty');
  const products = db.read('products');
  return rawItems.map((it) => {
    const p = products.find((x) => x.id === Number(it.productId ?? it.id));
    if (!p) throw bad(`Medicine #${it.productId ?? it.id} not available`);
    const qty = Math.max(1, Math.floor(Number(it.qty) || 1));
    if (p.stock < qty) throw bad(`Only ${p.stock} unit(s) of ${p.name} left in stock`);
    return {
      productId: p.id,
      name: p.name,
      brand: p.brand,
      packSize: p.packSize,
      price: p.price,
      mrp: p.mrp,
      qty,
      lineTotal: round2(p.price * qty),
    };
  });
}

function reduceStock(items) {
  const products = db.read('products');
  items.forEach((it) => {
    const p = products.find((x) => x.id === it.productId);
    if (p) p.stock = Math.max(0, p.stock - it.qty);
  });
  db.write('products', products);
}

route('POST', '/api/orders', (ctx) => {
  const user = needAuth(ctx);
  if (user.role === 'admin') throw bad('Admin account cannot place customer orders');
  const items = buildItems(ctx.body.items);
  const subtotal = round2(items.reduce((s, i) => s + i.lineTotal, 0));
  const total = subtotal;
  const paymentMode = ['cod', 'upi', 'credit'].includes(ctx.body.paymentMode) ? ctx.body.paymentMode : 'cod';
  const phone = str(ctx.body.phone ?? user.phone, 'Phone', { min: 10 });
  const address = str(ctx.body.address ?? user.address, 'Delivery address', { min: 5 });

  reduceStock(items);
  const count = db.read('orders').length + 1;
  const order = db.insert('orders', {
    orderNo: 'ORD-' + String(2026).slice(2) + '-' + String(count).padStart(4, '0'),
    userId: user.id,
    customerName: user.name,
    phone,
    address,
    items,
    subtotal,
    total,
    paymentMode,
    status: 'pending',
    date: nowISO(),
  });

  if (paymentMode === 'credit') {
    addLedgerEntry({
      partyType: 'customer',
      partyId: user.id,
      partyName: user.name,
      type: 'credit',
      amount: total,
      mode: 'credit',
      note: `Online order ${order.orderNo} on credit (udhaar)`,
      refType: 'order',
      refId: order.id,
    });
  }
  return { status: 201, body: { order } };
});

route('GET', '/api/orders/mine', (ctx) => {
  const user = needAuth(ctx);
  const orders = db.read('orders').filter((o) => o.userId === user.id).reverse();
  const ledger = db.read('ledger').filter((e) => e.partyType === 'customer' && e.partyId === user.id).reverse();
  return { status: 200, body: { orders, ledger, balance: customerBalance(user.id) } };
});

route('GET', '/api/admin/orders', (ctx) => {
  needAdmin(ctx);
  const orders = db.read('orders').slice().reverse();
  return { status: 200, body: { orders } };
});

route('PUT', '/api/admin/orders/:id/status', (ctx) => {
  needAdmin(ctx);
  const status = str(ctx.body.status, 'Status');
  if (!['pending', 'packed', 'delivered', 'cancelled'].includes(status)) throw bad('Invalid status');
  const order = db.update('orders', Number(ctx.params.id), { status });
  if (!order) throw notFound('Order not found');
  return { status: 200, body: { order } };
});

/* ---------------- ADMIN COUNTER SALES ---------------- */
route('GET', '/api/admin/sales', (ctx) => {
  needAdmin(ctx);
  return { status: 200, body: { sales: db.read('sales').slice().reverse() } };
});

route('POST', '/api/admin/sales', (ctx) => {
  const admin = needAdmin(ctx);
  const items = buildItems(ctx.body.items);
  const discount = Number(ctx.body.discount) || 0;
  const subtotal = round2(items.reduce((s, i) => s + i.lineTotal, 0));
  const total = round2(Math.max(0, subtotal - discount));
  const paymentMode = ['cash', 'upi', 'credit'].includes(ctx.body.paymentMode) ? ctx.body.paymentMode : 'cash';

  let customerId = ctx.body.customerId ? Number(ctx.body.customerId) : null;
  let customerName = String(ctx.body.customerName || '').trim();
  const users = db.read('users');
  if (customerId) {
    const u = users.find((x) => x.id === customerId);
    if (!u) throw bad('Customer not found');
    customerName = u.name;
  }
  if (!customerName) customerName = 'Walk-in Customer';
  if (paymentMode === 'credit' && customerName === 'Walk-in Customer') {
    throw bad('Choose a registered customer or enter a name for a credit sale');
  }

  const paid = paymentMode === 'credit' ? round2(Number(ctx.body.paidAmount) || 0) : total;
  const due = round2(total - paid);
  if (paid > total) throw bad('Paid amount cannot be more than the bill total');

  reduceStock(items);
  const seq = db.read('sales').length + 1;
  const sale = db.insert('sales', {
    invoiceNo: 'INV-2026-' + String(seq).padStart(4, '0'),
    customerId,
    customerName,
    phone: String(ctx.body.phone || '').trim(),
    items,
    subtotal,
    discount: round2(discount),
    total,
    paymentMode,
    paid,
    due,
    note: String(ctx.body.note || '').trim(),
    soldBy: admin.name,
    date: nowISO(),
  });

  // Only credit (udhaar) bills touch the ledger: the FULL bill is posted as a
  // credit entry and whatever the customer paid at once is posted as debit,
  // so the running balance is always exactly (bill total - amount paid).
  if (paymentMode === 'credit') {
    addLedgerEntry({
      partyType: 'customer',
      partyId: customerId,
      partyName: customerName,
      type: 'credit',
      amount: total,
      mode: 'credit',
      note: `Credit sale ${sale.invoiceNo}${ctx.body.note ? ' — ' + ctx.body.note : ''}`,
      refType: 'sale',
      refId: sale.id,
    });
    if (paid > 0) {
      addLedgerEntry({
        partyType: 'customer',
        partyId: customerId,
        partyName: customerName,
        type: 'debit',
        amount: paid,
        mode: 'cash',
        note: `Amount received with credit sale ${sale.invoiceNo}`,
        refType: 'sale',
        refId: sale.id,
      });
    }
  }
  return { status: 201, body: { sale } };
});

/* ---------------- PURCHASES (goods bought from suppliers = debit) ---------------- */
route('GET', '/api/admin/purchases', (ctx) => {
  needAdmin(ctx);
  return { status: 200, body: { purchases: db.read('purchases').slice().reverse() } };
});

route('POST', '/api/admin/purchases', (ctx) => {
  const admin = needAdmin(ctx);
  const supplier = str(ctx.body.supplier, 'Supplier name', { min: 2 });
  const raw = Array.isArray(ctx.body.items) ? ctx.body.items : [];
  if (raw.length === 0) throw bad('Add at least one item purchased');

  const items = raw.map((it) => {
    const name = str(it.name, 'Item name');
    const qty = Math.max(1, Math.floor(Number(it.qty) || 1));
    const cost = num(it.cost, `Cost of ${name}`);
    return { name, qty, cost: round2(cost), lineTotal: round2(cost * qty), productId: it.productId ? Number(it.productId) : null };
  });

  const total = round2(items.reduce((s, i) => s + i.lineTotal, 0));
  const paymentMode = ['cash', 'upi', 'credit'].includes(ctx.body.paymentMode) ? ctx.body.paymentMode : 'credit';
  const paid = paymentMode === 'credit' ? round2(Number(ctx.body.paidAmount) || 0) : total;
  const due = round2(total - paid);
  if (paid > total) throw bad('Paid amount cannot be more than the bill total');

  // add purchased quantity back into stock when linked to an existing medicine
  const products = db.read('products');
  items.forEach((it) => {
    const p = products.find((x) => x.id === it.productId);
    if (p) p.stock += it.qty;
  });
  db.write('products', products);

  const seq = db.read('purchases').length + 1;
  const purchase = db.insert('purchases', {
    billNo: String(ctx.body.billNo || '').trim() || 'PUR-2026-' + String(seq).padStart(4, '0'),
    supplier,
    supplierPhone: String(ctx.body.supplierPhone || '').trim(),
    items,
    total,
    paymentMode,
    paid,
    due,
    note: String(ctx.body.note || '').trim(),
    enteredBy: admin.name,
    date: nowISO(),
  });

  // Only credit purchases touch the ledger: full bill = debit (payable),
  // amount already paid = credit, so payable = total - paid.
  if (paymentMode === 'credit') {
    addLedgerEntry({
      partyType: 'supplier',
      partyName: supplier,
      type: 'debit',
      amount: total,
      mode: 'credit',
      note: `Goods purchased on credit — bill ${purchase.billNo}`,
      refType: 'purchase',
      refId: purchase.id,
    });
    if (paid > 0) {
      addLedgerEntry({
        partyType: 'supplier',
        partyName: supplier,
        type: 'credit',
        amount: paid,
        mode: 'cash',
        note: `Payment made against bill ${purchase.billNo}`,
        refType: 'purchase',
        refId: purchase.id,
      });
    }
  }
  return { status: 201, body: { purchase } };
});

route('POST', '/api/admin/purchases/:id/pay', (ctx) => {
  needAdmin(ctx);
  const purchase = db.read('purchases').find((p) => p.id === Number(ctx.params.id));
  if (!purchase) throw notFound('Purchase not found');
  const amount = num(ctx.body.amount, 'Amount', { min: 1 });
  const paid = round2(Math.min(purchase.total, purchase.paid + amount));
  const updated = db.update('purchases', purchase.id, { paid, due: round2(purchase.total - paid) });
  addLedgerEntry({
    partyType: 'supplier',
    partyName: purchase.supplier,
    type: 'credit',
    amount,
    mode: ctx.body.mode || 'cash',
    note: `Payment to supplier ${purchase.supplier} for bill ${purchase.billNo}`,
    refType: 'purchase',
    refId: purchase.id,
  });
  return { status: 200, body: { purchase: updated } };
});

/* ---------------- LEDGER (credit / debit register) ---------------- */
route('GET', '/api/admin/ledger', (ctx) => {
  needAdmin(ctx);
  const partyType = ctx.url.searchParams.get('partyType');
  const partyId = ctx.url.searchParams.get('partyId');
  let rows = db.read('ledger');
  if (partyType) rows = rows.filter((e) => e.partyType === partyType);
  if (partyId) rows = rows.filter((e) => e.partyId === Number(partyId));
  rows = rows.slice().sort((a, b) => new Date(b.date) - new Date(a.date));

  const customers = db
    .read('users')
    .filter((u) => u.role === 'customer')
    .map((u) => ({ id: u.id, name: u.name, ...customerBalance(u.id) }));
  const supplierNames = [...new Set(db.read('ledger').filter((e) => e.partyType === 'supplier').map((e) => e.partyName))];
  const suppliers = supplierNames.map((n) => ({ name: n, ...supplierBalance(n) }));

  const totals = {
    creditSale: round2(rows.filter((e) => e.partyType === 'customer' && e.type === 'credit').reduce((s, e) => s + e.amount, 0)),
    received: round2(rows.filter((e) => e.partyType === 'customer' && e.type === 'debit').reduce((s, e) => s + e.amount, 0)),
    debitPurchase: round2(rows.filter((e) => e.partyType === 'supplier' && e.type === 'debit').reduce((s, e) => s + e.amount, 0)),
    supplierPaid: round2(rows.filter((e) => e.partyType === 'supplier' && e.type === 'credit').reduce((s, e) => s + e.amount, 0)),
  };

  return { status: 200, body: { entries: rows, customers, suppliers, totals } };
});

/** Manual entry: customer payment received / supplier payment made / opening balance */
route('POST', '/api/admin/ledger', (ctx) => {
  const admin = needAdmin(ctx);
  const partyType = ctx.body.partyType === 'supplier' ? 'supplier' : 'customer';
  const type = ctx.body.type === 'debit' ? 'debit' : 'credit';
  const amount = num(ctx.body.amount, 'Amount', { min: 1 });
  let partyId = ctx.body.partyId ? Number(ctx.body.partyId) : null;
  let partyName = String(ctx.body.partyName || '').trim();

  if (partyType === 'customer' && partyId) {
    const u = db.read('users').find((x) => x.id === partyId);
    if (!u) throw bad('Customer not found');
    partyName = u.name;
  }
  if (!partyName) throw bad('Party name is required');

  const entry = addLedgerEntry({
    partyType,
    partyId,
    partyName,
    type,
    amount,
    mode: ctx.body.mode || 'cash',
    note: String(ctx.body.note || '').trim() || (type === 'credit' ? 'Credit entry' : 'Debit entry'),
    refType: 'manual',
    refId: null,
  });
  return { status: 201, body: { entry, by: admin.name } };
});

/* ---------------- USERS (admin view) ---------------- */
route('GET', '/api/admin/users', (ctx) => {
  needAdmin(ctx);
  const users = db.read('users').map((u) => {
    const { passwordHash, ...safe } = u;
    const orders = db.read('orders').filter((o) => o.userId === u.id);
    const purchasesTotal = orders.reduce((s, o) => s + o.total, 0);
    return {
      ...safe,
      orderCount: orders.length,
      purchaseValue: round2(purchasesTotal),
      ledger: customerBalance(u.id),
    };
  });
  return { status: 200, body: { users } };
});

route('GET', '/api/admin/users/:id', (ctx) => {
  needAdmin(ctx);
  const u = db.read('users').find((x) => x.id === Number(ctx.params.id));
  if (!u) throw notFound('User not found');
  const { passwordHash, ...safe } = u;
  const orders = db.read('orders').filter((o) => o.userId === u.id).reverse();
  const sales = db.read('sales').filter((s) => s.customerId === u.id).reverse();
  const ledger = db.read('ledger')
    .filter((e) => e.partyType === 'customer' && e.partyId === u.id)
    .sort((a, b) => new Date(b.date) - new Date(a.date));
  return {
    status: 200,
    body: { user: safe, orders, sales, ledger, balance: customerBalance(u.id) },
  };
});

/* ---------------- DASHBOARD STATS ---------------- */
route('GET', '/api/admin/stats', (ctx) => {
  needAdmin(ctx);
  const sales = db.read('sales');
  const orders = db.read('orders');
  const purchases = db.read('purchases');
  const products = db.read('products');
  const users = db.read('users').filter((u) => u.role === 'customer');
  const ledger = db.read('ledger');

  const today = new Date().toISOString().slice(0, 10);
  const isToday = (d) => String(d || '').slice(0, 10) === today;

  const counterSale = sales.reduce((s, x) => s + x.total, 0);
  const onlineSale = orders.filter((o) => o.status !== 'cancelled').reduce((s, x) => s + x.total, 0);
  const purchaseTotal = purchases.reduce((s, x) => s + x.total, 0);

  const customerDue = ledger
    .filter((e) => e.partyType === 'customer')
    .reduce((s, e) => s + (e.type === 'credit' ? e.amount : -e.amount), 0);
  const supplierDue = ledger
    .filter((e) => e.partyType === 'supplier')
    .reduce((s, e) => s + (e.type === 'debit' ? e.amount : -e.amount), 0);

  const monthly = {};
  [...sales, ...orders.filter((o) => o.status !== 'cancelled')].forEach((s) => {
    const key = String(s.date || '').slice(0, 7);
    if (!key) return;
    monthly[key] = round2((monthly[key] || 0) + s.total);
  });
  const trend = Object.keys(monthly).sort().slice(-6).map((k) => ({ month: k, total: monthly[k] }));

  return {
    status: 200,
    body: {
      stats: {
        revenue: round2(counterSale + onlineSale),
        counterSale: round2(counterSale),
        onlineSale: round2(onlineSale),
        purchaseTotal: round2(purchaseTotal),
        customerDue: round2(customerDue),
        supplierDue: round2(supplierDue),
        todaySale: round2(
          [...sales, ...orders].filter((x) => isToday(x.date) && x.status !== 'cancelled').reduce((s, x) => s + x.total, 0)
        ),
        customers: users.length,
        products: products.length,
        lowStock: products.filter((p) => p.stock <= 20).length,
        stockValue: round2(products.reduce((s, p) => s + p.price * p.stock, 0)),
        ordersPending: orders.filter((o) => o.status === 'pending').length,
        salesCount: sales.length,
        purchaseCount: purchases.length,
        trend,
      },
      lowStockItems: products.filter((p) => p.stock <= 20).sort((a, b) => a.stock - b.stock).slice(0, 6),
      recentSales: sales.slice(-5).reverse(),
      recentOrders: orders.slice(-5).reverse(),
    },
  };
});

/* ---------------- MAIN HANDLER ---------------- */
async function handle(req, res, url, body, user) {
  const found = matchRoute(req.method, url.pathname);
  if (!found) throw notFound(`No API route for ${req.method} ${url.pathname}`);
  const ctx = { req, res, url, body: body || {}, user, params: found.params };
  return await found.handler(ctx);
}

module.exports = { handle, HttpError, customerBalance, supplierBalance };
