/* ==========================================================
   common.js — shared helpers for all pages
   ========================================================== */
const API = {
  async call(path, method = 'GET', body) {
    const res = await fetch(path, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      credentials: 'same-origin',
      body: body ? JSON.stringify(body) : undefined,
    });
    let data = {};
    try { data = await res.json(); } catch { /* empty body */ }
    if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
    return data;
  },
  get: (p) => API.call(p),
  post: (p, b) => API.call(p, 'POST', b),
  put: (p, b) => API.call(p, 'PUT', b),
  del: (p) => API.call(p, 'DELETE'),
};

/** Indian rupee formatting: ₹1,25,000.50 */
const money = (n) =>
  '₹' + Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const money0 = (n) => '₹' + Math.round(Number(n || 0)).toLocaleString('en-IN');

const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const fmtDate = (iso) => {
  if (!iso) return '-';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
};
const fmtDateTime = (iso) => {
  if (!iso) return '-';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  return d.toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
};

function toast(msg, type = '') {
  let box = document.getElementById('toasts');
  if (!box) {
    box = document.createElement('div');
    box.id = 'toasts';
    document.body.appendChild(box);
  }
  const el = document.createElement('div');
  el.className = 'toast ' + type;
  el.textContent = msg;
  box.appendChild(el);
  setTimeout(() => { el.style.opacity = '0'; el.style.transition = '.3s'; }, 2800);
  setTimeout(() => el.remove(), 3200);
}

let _me;
async function me(force = false) {
  if (_me === undefined || force) {
    try { _me = (await API.get('/api/auth/me')).user; } catch { _me = null; }
  }
  return _me;
}
function clearMe() { _me = undefined; }

async function logout(redirect = '/index.html') {
  try { await API.post('/api/auth/logout'); } catch { /* ignore */ }
  clearMe();
  location.href = redirect;
}

const CART_KEY = 'vs_pharma_cart_v1';
const cart = {
  read() {
    try { return JSON.parse(localStorage.getItem(CART_KEY)) || []; } catch { return []; }
  },
  save(items) {
    localStorage.setItem(CART_KEY, JSON.stringify(items));
    cart.renderCount();
  },
  add(product, qty = 1) {
    const items = cart.read();
    const found = items.find((i) => i.productId === product.id);
    if (found) found.qty += qty;
    else items.push({ productId: product.id, name: product.name, brand: product.brand, price: product.price, mrp: product.mrp, packSize: product.packSize, qty });
    cart.save(items);
    toast(`${product.name} added to cart`, 'ok');
  },
  setQty(productId, qty) {
    let items = cart.read();
    if (qty <= 0) items = items.filter((i) => i.productId !== productId);
    else items.find((i) => i.productId === productId).qty = qty;
    cart.save(items);
  },
  clear() { cart.save([]); },
  count() { return cart.read().reduce((s, i) => s + i.qty, 0); },
  total() { return cart.read().reduce((s, i) => s + i.price * i.qty, 0); },
  renderCount() {
    const el = document.getElementById('cartCount');
    if (el) {
      const c = cart.count();
      el.textContent = c;
      el.style.display = c ? 'grid' : 'none';
    }
  },
};

/** Fills the header nav with login/logout links depending on the session. */
async function paintHeader() {
  const user = await me();
  const slot = document.getElementById('navAuth');
  if (slot) {
    slot.innerHTML = user
      ? `<a class="navlink" href="${user.role === 'admin' ? '/admin.html' : '/account.html'}">${user.role === 'admin' ? 'Admin Panel' : 'My Account'}</a>
         <button class="btn ghost sm" onclick="logout('/index.html')">Logout</button>`
      : `<a class="navlink" href="/login.html">Login</a>
         <a class="btn sm" href="/login.html?tab=register">Register</a>`;
  }
  const bal = document.getElementById('navUser');
  if (bal) bal.textContent = user ? `Hi, ${user.name.split(' ')[0]}` : '';
  cart.renderCount();
}

document.addEventListener('DOMContentLoaded', () => { cart.renderCount(); });
