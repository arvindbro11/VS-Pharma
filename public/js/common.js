/* ==========================================================
   common.js — shared helpers for all pages
   ========================================================== */
/* ------------------------------------------------------------
   Login token. Cookies alone are dropped inside cross-site/sandboxed
   iframes (e.g. preview panes), so the API also accepts the session as
   an "Authorization: Bearer <token>" header. Storage is best-effort:
   sandboxed frames can throw on storage access, hence the try/catch.
   ------------------------------------------------------------ */
const TOKEN_KEY = 'vs_pharma_token';
let _memoryToken = null;

const authToken = {
  _persisted: false,
  get() {
    if (_memoryToken) return _memoryToken;
    try { _memoryToken = localStorage.getItem(TOKEN_KEY) || sessionStorage.getItem(TOKEN_KEY) || null; } catch (e) { /* sandboxed */ }
    return _memoryToken;
  },
  set(token) {
    _memoryToken = token || null;
    authToken._persisted = false;
    try {
      if (token) { localStorage.setItem(TOKEN_KEY, token); authToken._persisted = true; }
      else { localStorage.removeItem(TOKEN_KEY); sessionStorage.removeItem(TOKEN_KEY); }
    } catch (e) {
      try {
        if (token) { sessionStorage.setItem(TOKEN_KEY, token); authToken._persisted = true; }
        else sessionStorage.removeItem(TOKEN_KEY);
      } catch (e2) { /* memory only — happens inside sandboxed iframes */ }
    }
  },
  isPersisted() { return authToken._persisted; },
  clear() { authToken.set(null); },
};

/** Builds a link that carries the session when storage is unavailable. */
function handoffUrl(target) {
  const token = authToken.get();
  if (token && !authToken.isPersisted()) {
    return target + (target.indexOf('#') === -1 ? '#t=' + encodeURIComponent(token) : '');
  }
  return target;
}

/* A page may receive the session through the URL fragment (sandboxed frames). */
(function adoptHashToken() {
  try {
    const m = /[#&]t=([^&]+)/.exec(location.hash || '');
    if (!m) return;
    authToken.set(decodeURIComponent(m[1]));
    try { history.replaceState(null, '', location.pathname + location.search); } catch (e) { /* ignore */ }
  } catch (e) { /* ignore */ }
})();

const API = {
  async call(path, method = 'GET', body) {
    const token = authToken.get();
    const headers = {};
    if (body) headers['Content-Type'] = 'application/json';
    if (token) headers.Authorization = 'Bearer ' + token;
    const res = await fetch(path, {
      method,
      headers,
      credentials: 'include',
      body: body ? JSON.stringify(body) : undefined,
    });
    let data = {};
    try { data = await res.json(); } catch { /* empty body */ }
    if (!res.ok) {
      if (res.status === 401 && token) { authToken.clear(); clearMe(); }
      throw new Error(data.error || `Request failed (${res.status})`);
    }
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
  authToken.clear();
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
      ? `<a class="navlink" data-href="${user.role === 'admin' ? '/admin.html' : '/account.html'}" href="${user.role === 'admin' ? '/admin.html' : '/account.html'}" onclick="this.href=handoffUrl(this.dataset.href)">${user.role === 'admin' ? 'Admin Panel' : 'My Account'}</a>
         <button class="btn ghost sm" onclick="logout('/index.html')">Logout</button>`
      : `<a class="navlink" href="/login.html">Login</a>
         <a class="btn sm" href="/login.html?tab=register">Register</a>`;
  }
  const bal = document.getElementById('navUser');
  if (bal) bal.textContent = user ? `Hi, ${user.name.split(' ')[0]}` : '';
  cart.renderCount();
}

document.addEventListener('DOMContentLoaded', () => { cart.renderCount(); });
