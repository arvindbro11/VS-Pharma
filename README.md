# VS Pharma &amp; Medical Store — Medicine / Pharmacy Website

A complete, ready-to-run **medical &amp; pharmacy seller website** with:

* 🏪 **Customer storefront** — browse medicines, search, cart, checkout (all prices in **₹ INR**)
* 👤 **User login / register page** — customer account, order history, personal **credit–debit (khata) statement**
* 🔐 **Admin panel** — records of customer orders, counter sales (cash / **credit**), goods **purchased** from suppliers (**debit**), medicine stock, customer information and the full **credit / debit ledger**
* 🗄️ **Backend with separate storage for every record type** (users, orders, sales, purchases, ledger, products, sessions)
* 📅 Company / store year: **2026**

Everything runs on **Node.js built-in modules only** — there is **nothing to install** (`npm install` is not required).

---

## 1. How to run it in VS Code

1. Open the folder **`vs-pharmacy`** in VS Code (`File → Open Folder…`).
2. Open the integrated terminal (`` Ctrl + ` ``).
3. Run:

   ```bash
   node server.js
   ```

   *(or press **F5** — a launch config for VS Code is already included in `.vscode/launch.json`)*
4. Open the printed links in your browser:

   | Page | URL |
   |------|-----|
   | Storefront (shop) | http://localhost:3000 |
   | Customer login / register | http://localhost:3000/login.html |
   | Customer account (orders + khata) | http://localhost:3000/account.html |
   | **Admin panel** | http://localhost:3000/admin.html |

> Development mode with auto-restart: `npm run dev`  (uses `node --watch`)

### Demo logins

| Role | Email | Password |
|------|-------|----------|
| **Admin** | `admin@vspharmacy.in` | `admin123` |
| Customer | `rahul@example.com` | `user123` |

New customers can be created from the **Register** tab on the login page.

### Demo records already inside `data/`

So the admin panel is not empty on first look, the store ships with a few sample records:

* 1 **credit sale** to Rahul Sharma — ₹182 bill, ₹100 paid → **₹82 due** in his khata
* 1 **cash sale** to a walk-in customer
* 1 **credit purchase** from *Sun Pharma Distributors* — ₹3,110 bill, ₹1,000 paid → **₹2,110 payable**
* 1 **online order** from Rahul Sharma (cash on delivery, pending)

Want a completely empty store? Run `npm run reset` and start the server again — it re-seeds only the two accounts and the 24 medicines.

---

## 2. Project structure

```
vs-pharmacy/
├── server.js               # LOCAL entry point: http.createServer(app).listen(3000)
├── api/[...path].js        # VERCEL entry point: exports the same handler for /api/*
├── vercel.json             # static output = public/, no-cache headers for html/css/js
├── package.json            # scripts (start / dev / reset) — no dependencies
├── .vscode/launch.json     # press F5 to run the website
├── src/
│   ├── app.js              # shared request handler (API router + static files) used by both entries
│   ├── db.js               # JSON storage layer (one file per collection, atomic writes, /tmp fallback)
│   ├── auth.js             # scrypt password hashing + cookie sessions
│   ├── api.js              # every API endpoint (auth, products, orders, sales, purchases, ledger, users, stats)
│   └── seed.js             # first-run seed: admin + customer + 24 medicines
├── public/
│   ├── index.html          # storefront: hero, search, medicine grid, cart drawer, checkout
│   ├── login.html          # user login + register (admin can log in here too)
│   ├── account.html        # customer portal: profile, orders, credit/debit statement
│   ├── admin.html          # admin panel (7 sections)
│   ├── css/style.css       # full stylesheet (no CDN, works offline)
│   └── js/common.js        # API helper, ₹ money formatter, cart, toasts, header state
└── data/                   # created automatically on first run
    ├── users.json          # admin + customer accounts (hashed passwords)
    ├── products.json       # medicine inventory &amp; stock
    ├── orders.json         # online purchases made by customers
    ├── sales.json          # counter sales (cash / UPI / credit) saved by admin
    ├── purchases.json      # goods bought from suppliers = debit
    ├── ledger.json         # credit / debit register (udhaar khata + supplier payables)
    └── sessions.json       # active login sessions
```

### “Each different to save”

Every record type is written to its **own file** (see list above) by `src/db.js`:
`orders` (customer purchases) ≠ `sales` (admin counter bills) ≠ `purchases` (goods bought) ≠ `ledger` (credit/debit entries) ≠ `users` (people).
Writes are atomic (`write temp → rename`) so data never gets corrupted mid-write.

---

## 3. What the admin can do

| Section | Purpose |
|---|---|
| **Dashboard** | Revenue, today's sale, **customer dues (credit)**, **supplier payable (debit)**, stock value, low-stock alerts, 6-month sales trend, recent sales/orders |
| **Customer Orders** | Every online order with items, payment mode, and status change (pending → packed → delivered / cancelled) |
| **Credit / Cash Sales** | Create a counter bill: pick a registered customer or walk-in, add items, discount, payment mode **cash / UPI / credit**. A credit bill automatically posts the balance to the ledger |
| **Goods Purchased** | Record stock bought from a supplier: bill no., items, cost, **credit or cash**. A credit purchase posts a **debit** (payable) entry; “Pay” button settles a supplier bill |
| **Medicines &amp; Stock** | Add / edit / delete medicines, prices in ₹, stock quantity, Rx flag. Stock is reduced by sales &amp; orders, increased by purchases |
| **Customers** | All registered users with contact, address, order count, purchase value, credit, debit and balance — plus a full per-customer record (orders + counter sales + ledger) |
| **Credit / Debit Ledger** | The register itself: credit sales, payments received, credit purchases, payments to suppliers, per-party balances, and a manual “+ Add entry” for payments / opening balances |

### Credit / debit logic used

| Party | Type | Meaning |
|---|---|---|
| Customer | **Credit** | Sale on udhaar → customer owes the store (balance ↑) |
| Customer | **Debit** | Payment received from customer (balance ↓) |
| Supplier | **Debit** | Goods bought on credit → store owes supplier (payable ↑) |
| Supplier | **Credit** | Payment made to supplier (payable ↓) |

---

## 4. API reference

**Auth**
```
POST   /api/auth/register        { name, email, phone, password, address }
POST   /api/auth/login           { email, password }
POST   /api/auth/logout
GET    /api/auth/me
PUT    /api/auth/profile         { name, phone, address, password? }
```
**Store (public)**
```
GET    /api/products?q=&category=
GET    /api/products/:id
```
**Customer**
```
POST   /api/orders               { items:[{productId,qty}], address, phone, paymentMode:'cod'|'upi'|'credit' }
GET    /api/orders/mine          -> orders + ledger + balance
```
**Admin — sales / purchases / ledger / users**
```
GET    /api/admin/orders
PUT    /api/admin/orders/:id/status     { status }
GET    /api/admin/sales
POST   /api/admin/sales                 { customerId|customerName, items, discount, paymentMode, paidAmount, note }
GET    /api/admin/purchases
POST   /api/admin/purchases             { supplier, supplierPhone, billNo, items:[{name,qty,cost,productId}], paymentMode, paidAmount }
POST   /api/admin/purchases/:id/pay     { amount, mode }
GET    /api/admin/ledger?partyType=&partyId=
POST   /api/admin/ledger                { partyType, type, partyId|partyName, amount, mode, note }
GET    /api/admin/users
GET    /api/admin/users/:id
POST   /api/admin/products              (create medicine)
PUT    /api/admin/products/:id
DELETE /api/admin/products/:id
GET    /api/admin/stats
```
Admin routes return **401** when not logged in and **403** for customer accounts.

---

## 4b. Deploy on Vercel (serverless)

The project ships two entry points so the exact same code runs locally **and** on Vercel:

| Runtime | Entry point | What it does |
|---|---|---|
| Local / VPS | `server.js` | `http.createServer(app).listen(3000)` |
| **Vercel** | `api/[...path].js` | exports the shared handler for every `/api/*` request |
| Shared logic | `src/app.js` | API routing, cookies, JSON + static file serving |

Static pages are served from `public/` (Vercel CDN). `vercel.json` sets `outputDirectory: "public"` and disables HTML/CSS/JS caching.

### ⚠️ Why the first deploy showed `500: FUNCTION_INVOCATION_FAILED`

Vercel never runs `server.js` — it only invokes **functions exported from `api/`**. The original repo had no `api/` folder and no exported handler, so every request failed at invocation. Fixed by adding `api/[...path].js` that exports the handler, and moving the shared logic into `src/app.js`.

### Deploy steps

```bash
git add -A && git commit -m "add vercel serverless entry"
git push                      # Vercel auto-redeploys if the repo is connected
```
or, from the CLI: `npm i -g vercel && vercel --prod`

### Storage on Vercel (important)

Serverless disks are **read-only and ephemeral**, so `data/*.json` cannot persist there. `src/db.js` detects this automatically and swaps to `/tmp/vs-pharma-data`:

```
[db] "/var/task/data" is not writable (EROFS) — using /tmp/vs-pharma-data
```

That means on Vercel the store works fully (login, sales, purchases, ledger) but **records can disappear on a cold start**, and two concurrent instances don't share data. For a permanent deployment set a real database, or point storage at a writable volume:

```bash
VS_DATA_DIR=/absolute/writable/path   # env var honoured by src/db.js
```

Swapping to MySQL/PostgreSQL/MongoDB only means re-implementing the six functions in `src/db.js` (`read`, `write`, `insert`, `update`, `remove`, `ensureData`) — no other file changes.

## 5. Design system — premium palette ("Onyx & Gold")

A true dark-luxury theme built from **three premium colours** and nothing else. All values live in the `:root` block of `public/css/style.css`; a visual look-book is served at **http://localhost:3000/theme.html**.

| Role | Colour | Hex | Used for |
|---|---|---|---|
| 1 — **Jet Black** | depth | `#070707` · `#0B0B0B` · `#121212` | page, hero, admin sidebar, cards, footer, drawers |
| 2 — **Gold** | everything precious | `#D4AF37` (`#F2DC9B` light · `#A5822A` deep) | CTA buttons, overlines, hairlines, prices/stat numerals, active rails, chart bars |
| 3 — **Pearl Ivory** | clarity | `#F5EFE3` (`#FBF7EE` paper) | primary type on black **and** the ivory "invitation" cards used for every form |

Functional tints (used only for status, never as decoration): success `#5CB98A`, warning `#E0BF62`, danger `#D97068`.

**Design language**
* High-contrast serif display (Georgia) for headings, prices and all figures; sans-serif for dense UI.
* Gold hairline rules, 1px gold-tinted borders, and a gold top-edge that fades in on card hover.
* Gold gradient buttons with a soft outer glow; ghost buttons that turn gold on hover.
* Hero + admin login: jet-black gradient with a faint gold grid, radial gold glow and a rotated **EST. 2026** seal.
* **Ivory invitation cards** (`class="card paper-card"`) carry the login / register / admin-login forms — the third colour used as a real surface for maximum contrast.
* Admin sidebar: black glass with a gold active rail; tables on near-black with gold letter-spaced headers.
* Custom dark scrollbars, gold text selection, no external fonts or images (works fully offline).

Re-skin in three lines:

```css
:root { --black: #070707; --gold: #d4af37; --ivory: #f5efe3; }
```

Alternates documented at the end of the stylesheet:

| Theme | black | gold | ivory |
|---|---|---|---|
| **Onyx &amp; Gold** *(current)* | `#070707` | `#d4af37` | `#f5efe3` |
| Obsidian &amp; Champagne | `#0a0a0c` | `#cbb47f` | `#f3efe6` |
| Espresso &amp; Brass | `#120d0a` | `#c69a52` | `#f4ece1` |

## 6. Useful commands

```bash
npm start        # start the website on port 3000
npm run dev      # start with auto-restart on file change
npm run reset    # delete the data/ folder (fresh demo store on next start)
PORT=8080 node server.js   # run on a different port
```

---

## 7. Notes for going live

* Data is stored in JSON files so the project has **zero dependencies** — perfect for college projects, demos and small single-store use. For multi-user production traffic, replace `src/db.js` with MySQL / PostgreSQL / MongoDB (the function names `read/write/insert/update/remove` stay the same, so no other file changes).
* Passwords are hashed with **scrypt**; sessions are **HttpOnly cookies** (7 days).
* Change the demo admin password from **My Account → …** or by editing `data/users.json` (hash a new password with `require('./src/auth').hashPassword('newpass')`).
* Add HTTPS (e.g. behind Nginx/Caddy) before exposing the admin panel to the internet.

© 2026 VS Pharma &amp; Medical Store — Drug Licence PB-AMR-2026-1188. All prices in ₹ (INR).
