/* =====================================================================
   Cardamom Plantation Expense Tracker
   Pure vanilla JS. All data stored in localStorage under STORAGE_KEY.
   SECURITY NOTE: This is a client-only prototype. Local Storage is not
   encrypted or secure. Anyone with access to this browser/profile can
   read or edit stored data (including passwords) via DevTools. Do not
   use real sensitive financial data. See README.md for details.
   ===================================================================== */

const STORAGE_KEY = 'cardamom_tracker_data_v1';
const SESSION_KEY = 'cardamom_tracker_session_v1';

const DEFAULT_CATEGORIES = [
  'Labour', 'Fertilizer', 'Pesticides', 'Irrigation', 'Tools',
  'Transport', 'Harvesting', 'Packaging', 'Maintenance', 'Miscellaneous'
];

const PAYMENT_METHODS = ['Cash', 'Bank Transfer', 'Cheque', 'UPI/Mobile', 'Credit', 'Other'];

const BUILTIN_FIELDS = [
  { id: 'date', label: 'Expense Date', type: 'date', required: true, builtin: true },
  { id: 'category', label: 'Category', type: 'category', required: true, builtin: true },
  { id: 'description', label: 'Description', type: 'text', required: true, builtin: true },
  { id: 'amount', label: 'Amount', type: 'number', required: true, builtin: true },
  { id: 'currency', label: 'Currency', type: 'dropdown', required: true, builtin: true, options: ['INR', 'USD', 'BHD', 'EUR'] },
  { id: 'paymentMethod', label: 'Payment Method', type: 'dropdown', required: true, builtin: true, options: PAYMENT_METHODS },
  { id: 'supplier', label: 'Supplier / Recipient', type: 'text', required: false, builtin: true },
  { id: 'reference', label: 'Receipt / Reference No.', type: 'text', required: false, builtin: true },
  { id: 'notes', label: 'Notes', type: 'text', required: false, builtin: true }
];

/* ---------------------- State ---------------------- */
let DB = null;
let session = null; // { username, role }
let currentView = 'dashboard';
let editingExpenseId = null;
let editingCategoryId = null;
let editingFieldId = null;
let editingUserId = null;
let confirmCallback = null;

/* ===================================================================
   STORAGE
   =================================================================== */
function uid() {
  return 'id_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 9);
}

function defaultDB() {
  return {
    setupComplete: false,
    users: [],
    categories: DEFAULT_CATEGORIES.map((name, i) => ({
      id: uid(), name, active: true, order: i
    })),
    customFields: [],
    expenses: []
  };
}

function loadDB() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultDB();
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return defaultDB();
    // graceful merge with defaults for missing keys (corrupted/partial data)
    const fresh = defaultDB();
    return {
      setupComplete: !!parsed.setupComplete,
      users: Array.isArray(parsed.users) ? parsed.users : fresh.users,
      categories: Array.isArray(parsed.categories) && parsed.categories.length ? parsed.categories : fresh.categories,
      customFields: Array.isArray(parsed.customFields) ? parsed.customFields : [],
      expenses: Array.isArray(parsed.expenses) ? parsed.expenses : []
    };
  } catch (e) {
    console.error('Corrupted storage data, resetting to defaults.', e);
    return defaultDB();
  }
}

function saveDB() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(DB));
  } catch (e) {
    showToast('Failed to save data: storage may be full.', 'error');
  }
}

function loadSession() {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) { return null; }
}
function saveSession(s) {
  session = s;
  if (s) sessionStorage.setItem(SESSION_KEY, JSON.stringify(s));
  else sessionStorage.removeItem(SESSION_KEY);
}

/* ===================================================================
   UTIL
   =================================================================== */
function showToast(msg, type = 'default') {
  const container = document.getElementById('toastContainer');
  const el = document.createElement('div');
  el.className = 'toast' + (type !== 'default' ? ' ' + type : '');
  el.textContent = msg;
  container.appendChild(el);
  setTimeout(() => el.remove(), 3500);
}

function showConfirm(title, message, onConfirm) {
  document.getElementById('confirmTitle').textContent = title;
  document.getElementById('confirmMessage').textContent = message;
  confirmCallback = onConfirm;
  document.getElementById('confirmOverlay').classList.remove('hidden');
}

function fmtMoney(amount, currency) {
  const n = Number(amount) || 0;
  return (currency ? currency + ' ' : '') + n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDate(d) {
  if (!d) return '';
  const dt = new Date(d + 'T00:00:00');
  if (isNaN(dt)) return d;
  return dt.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

function todayStr() {
  const d = new Date();
  return d.toISOString().slice(0, 10);
}

function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

function activeCategories() {
  return DB.categories.filter(c => c.active).sort((a, b) => a.order - b.order);
}

function allFieldsForForm() {
  return BUILTIN_FIELDS.concat(DB.customFields.filter(f => f.active !== false));
}

function getCategoryName(id) {
  const c = DB.categories.find(c => c.id === id);
  return c ? c.name : '(deleted category)';
}

/* ===================================================================
   AUTH / SESSION HELPERS
   NOTE: plaintext password compare is acceptable only because this is
   a local-browser prototype, not a real security boundary.
   =================================================================== */
function findUser(username) {
  return DB.users.find(u => u.username.toLowerCase() === username.toLowerCase());
}

function isUsernameTaken(username, excludeId) {
  return DB.users.some(u => u.username.toLowerCase() === username.toLowerCase() && u.id !== excludeId);
}

/* ===================================================================
   INIT / ROUTING
   =================================================================== */
document.addEventListener('DOMContentLoaded', () => {
  DB = loadDB();
  session = loadSession();

  wireStaticHandlers();

  if (!DB.setupComplete) {
    showScreen('setupScreen');
  } else if (!session || !findUser(session.username)) {
    showScreen('loginScreen');
  } else {
    const u = findUser(session.username);
    if (!u || !u.active) {
      saveSession(null);
      showScreen('loginScreen');
    } else {
      enterApp();
    }
  }
});

function showScreen(id) {
  ['setupScreen', 'loginScreen', 'appScreen'].forEach(s => {
    document.getElementById(s).classList.toggle('hidden', s !== id);
  });
}

/* ===================================================================
   SETUP SCREEN
   =================================================================== */
function wireStaticHandlers() {
  document.getElementById('setupForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const adminUser = document.getElementById('setupAdminUser').value.trim();
    const adminPass = document.getElementById('setupAdminPass').value;
    const userUser = document.getElementById('setupUserUser').value.trim();
    const userPass = document.getElementById('setupUserPass').value;

    if (adminUser.toLowerCase() === userUser.toLowerCase()) {
      showToast('Admin and user usernames must be different.', 'error');
      return;
    }

    DB.users.push({ id: uid(), username: adminUser, password: adminPass, role: 'admin', active: true });
    DB.users.push({ id: uid(), username: userUser, password: userPass, role: 'user', active: true });
    DB.setupComplete = true;
    saveDB();
    showToast('Setup complete. Please sign in.', 'success');
    showScreen('loginScreen');
  });

  document.getElementById('loginForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const username = document.getElementById('loginUser').value.trim();
    const password = document.getElementById('loginPass').value;
    const errorBox = document.getElementById('loginError');
    const user = findUser(username);

    if (!user || user.password !== password) {
      errorBox.textContent = 'Invalid username or password.';
      errorBox.classList.remove('hidden');
      return;
    }
    if (!user.active) {
      errorBox.textContent = 'This account has been deactivated. Contact your admin.';
      errorBox.classList.remove('hidden');
      return;
    }
    errorBox.classList.add('hidden');
    saveSession({ username: user.username, role: user.role });
    document.getElementById('loginForm').reset();
    enterApp();
  });

  document.getElementById('resetAppLink').addEventListener('click', () => {
    showConfirm(
      'Reset Application',
      'This will permanently erase all users, categories, fields and expenses stored in this browser. This cannot be undone. Continue?',
      () => {
        localStorage.removeItem(STORAGE_KEY);
        sessionStorage.removeItem(SESSION_KEY);
        DB = defaultDB();
        session = null;
        showToast('Application data reset.', 'success');
        showScreen('setupScreen');
      }
    );
  });

  document.getElementById('logoutBtn').addEventListener('click', () => {
    saveSession(null);
    showScreen('loginScreen');
  });

  document.getElementById('hamburgerBtn').addEventListener('click', () => {
    document.getElementById('sidebar').classList.toggle('open');
  });

  document.getElementById('addExpenseTopBtn').addEventListener('click', () => openExpenseModal());

  // Confirm modal
  document.getElementById('confirmCancel').addEventListener('click', closeConfirm);
  document.getElementById('confirmOk').addEventListener('click', () => {
    const cb = confirmCallback;
    closeConfirm();
    if (cb) cb();
  });

  // Expense modal
  document.getElementById('expenseCancelBtn').addEventListener('click', closeExpenseModal);
  document.getElementById('expenseForm').addEventListener('submit', handleExpenseSubmit);

  // Category modal
  document.getElementById('categoryCancelBtn').addEventListener('click', closeCategoryModal);
  document.getElementById('categoryForm').addEventListener('submit', handleCategorySubmit);

  // Field modal
  document.getElementById('fieldCancelBtn').addEventListener('click', closeFieldModal);
  document.getElementById('fieldForm').addEventListener('submit', handleFieldSubmit);
  document.getElementById('fieldTypeInput').addEventListener('change', (e) => {
    document.getElementById('fieldOptionsWrap').style.display = e.target.value === 'dropdown' ? 'block' : 'none';
  });

  // User modal
  document.getElementById('userCancelBtn').addEventListener('click', closeUserModal);
  document.getElementById('userForm').addEventListener('submit', handleUserSubmit);

  // Import file
  document.getElementById('importFileInput').addEventListener('change', handleImportFile);
}

function closeConfirm() {
  document.getElementById('confirmOverlay').classList.add('hidden');
  confirmCallback = null;
}

/* ===================================================================
   APP ENTRY / NAV
   =================================================================== */
function enterApp() {
  showScreen('appScreen');
  renderSidebar();
  const defaultView = session.role === 'admin' ? 'dashboard' : 'dashboard';
  navigateTo(defaultView);
}

function navItemsForRole(role) {
  if (role === 'admin') {
    return [
      { key: 'dashboard', label: '📊 Dashboard' },
      { key: 'expenses', label: '🧾 All Expenses' },
      { key: 'categories', label: '🏷️ Categories' },
      { key: 'fields', label: '🧩 Custom Fields' },
      { key: 'users', label: '👥 Users' },
      { key: 'reports', label: '📈 Reports' },
      { key: 'data', label: '💾 Data Management' }
    ];
  }
  return [
    { key: 'dashboard', label: '📊 Dashboard' },
    { key: 'expenses', label: '🧾 My Expenses' },
    { key: 'data', label: '💾 Backup & Restore' }
  ];
}

function renderSidebar() {
  const nav = document.getElementById('sidebarNav');
  const items = navItemsForRole(session.role);
  nav.innerHTML = '';
  items.forEach(item => {
    const btn = document.createElement('button');
    btn.className = 'nav-item' + (currentView === item.key ? ' active' : '');
    btn.textContent = item.label;
    btn.dataset.view = item.key;
    btn.addEventListener('click', () => navigateTo(item.key));
    nav.appendChild(btn);
  });

  document.getElementById('sidebarUserName').textContent = session.username;
  document.getElementById('sidebarUserRole').textContent = session.role;
  document.getElementById('sidebarAvatar').textContent = session.username.charAt(0).toUpperCase();
}

function navigateTo(view) {
  currentView = view;
  document.getElementById('sidebar').classList.remove('open');
  renderSidebar();
  const titles = {
    dashboard: 'Dashboard', expenses: session.role === 'admin' ? 'All Expenses' : 'My Expenses',
    categories: 'Manage Categories', fields: 'Custom Fields', users: 'User Management',
    reports: 'Reports', data: 'Data Management'
  };
  document.getElementById('pageTitle').textContent = titles[view] || 'Dashboard';
  const area = document.getElementById('contentArea');
  area.innerHTML = '';

  switch (view) {
    case 'dashboard': renderDashboard(area); break;
    case 'expenses': renderExpensesView(area); break;
    case 'categories': renderCategoriesView(area); break;
    case 'fields': renderFieldsView(area); break;
    case 'users': renderUsersView(area); break;
    case 'reports': renderReportsView(area); break;
    case 'data': renderDataView(area); break;
    default: area.innerHTML = '<p>Not found.</p>';
  }
}

/* ===================================================================
   EXPENSE QUERY HELPERS
   =================================================================== */
function visibleExpenses() {
  if (session.role === 'admin') return DB.expenses;
  return DB.expenses.filter(e => e.createdBy === session.username);
}

function monthKey(dateStr) {
  return (dateStr || '').slice(0, 7); // YYYY-MM
}

/* ===================================================================
   DASHBOARD
   =================================================================== */
function renderDashboard(area) {
  const expenses = visibleExpenses();
  const total = expenses.reduce((s, e) => s + Number(e.amount || 0), 0);
  const thisMonth = monthKey(todayStr());
  const todayS = todayStr();
  const monthTotal = expenses.filter(e => monthKey(e.date) === thisMonth).reduce((s, e) => s + Number(e.amount || 0), 0);
  const dayTotal = expenses.filter(e => e.date === todayS).reduce((s, e) => s + Number(e.amount || 0), 0);

  const byCategory = {};
  expenses.forEach(e => {
    const cat = getCategoryName(e.category);
    byCategory[cat] = (byCategory[cat] || 0) + Number(e.amount || 0);
  });
  const catRows = Object.entries(byCategory).sort((a, b) => b[1] - a[1]);

  const recent = [...expenses].sort((a, b) => (b.date || '').localeCompare(a.date || '') || b.createdAt - a.createdAt).slice(0, 8);

  const html = [];

  html.push('<div class="summary-grid">');
  html.push(summaryCard('Total Expenses', fmtMoney(total, ''), '💰', true));
  html.push(summaryCard('This Month', fmtMoney(monthTotal, ''), '📅'));
  html.push(summaryCard('Today', fmtMoney(dayTotal, ''), '☀️'));
  html.push(summaryCard('Total Records', String(expenses.length), '🧾'));
  html.push('</div>');

  html.push('<div class="section-block">');
  html.push('<div class="section-head"><h3>Category-wise Summary</h3></div>');
  if (catRows.length === 0) {
    html.push('<div class="card empty-state">No expenses recorded yet.</div>');
  } else {
    html.push('<div class="table-wrap"><table><thead><tr><th>Category</th><th>Total</th><th>% of Total</th></tr></thead><tbody>');
    catRows.forEach(([cat, amt]) => {
      const pct = total > 0 ? ((amt / total) * 100).toFixed(1) : '0.0';
      html.push(`<tr><td data-label="Category"><span class="cat-pill">${escapeHtml(cat)}</span></td><td data-label="Total" class="amount-cell">${fmtMoney(amt, '')}</td><td data-label="%">${pct}%</td></tr>`);
    });
    html.push('</tbody></table></div>');
  }
  html.push('</div>');

  html.push('<div class="section-block">');
  html.push('<div class="section-head"><h3>Recent Transactions</h3></div>');
  html.push(buildExpenseTable(recent, false));
  html.push('</div>');

  area.innerHTML = html.join('');
  wireExpenseRowActions(area);
}

function summaryCard(label, value, icon, gold) {
  return `<div class="summary-card${gold ? ' gold' : ''}"><div class="label">${label}</div><div class="value">${value}</div><div class="icon">${icon}</div></div>`;
}

/* ===================================================================
   EXPENSE TABLE BUILDER (shared)
   =================================================================== */
function buildExpenseTable(list, showOwner) {
  if (list.length === 0) {
    return '<div class="table-wrap"><div class="empty-state">No expenses found.</div></div>';
  }
  const rows = list.map(e => {
    const actions = `
      <div class="row-actions">
        <button class="icon-btn" data-action="edit-expense" data-id="${e.id}">✏️</button>
        <button class="icon-btn danger" data-action="delete-expense" data-id="${e.id}">🗑️</button>
      </div>`;
    return `<tr>
      <td data-label="Date">${fmtDate(e.date)}</td>
      <td data-label="Category"><span class="cat-pill">${escapeHtml(getCategoryName(e.category))}</span></td>
      <td data-label="Description">${escapeHtml(e.description)}</td>
      <td data-label="Amount" class="amount-cell">${fmtMoney(e.amount, e.currency)}</td>
      <td data-label="Payment">${escapeHtml(e.paymentMethod || '')}</td>
      ${showOwner ? `<td data-label="By">${escapeHtml(e.createdBy || '')}</td>` : ''}
      <td data-label="Actions">${actions}</td>
    </tr>`;
  }).join('');

  return `<div class="table-wrap"><table><thead><tr>
    <th>Date</th><th>Category</th><th>Description</th><th>Amount</th><th>Payment</th>
    ${showOwner ? '<th>By</th>' : ''}
    <th>Actions</th>
  </tr></thead><tbody>${rows}</tbody></table></div>`;
}

function wireExpenseRowActions(area) {
  area.querySelectorAll('[data-action="edit-expense"]').forEach(btn => {
    btn.addEventListener('click', () => openExpenseModal(btn.dataset.id));
  });
  area.querySelectorAll('[data-action="delete-expense"]').forEach(btn => {
    btn.addEventListener('click', () => {
      showConfirm('Delete Expense', 'Are you sure you want to delete this expense record? This cannot be undone.', () => {
        DB.expenses = DB.expenses.filter(e => e.id !== btn.dataset.id);
        saveDB();
        showToast('Expense deleted.', 'success');
        navigateTo(currentView);
      });
    });
  });
}

/* ===================================================================
   EXPENSES VIEW (list + filters + CSV export)
   =================================================================== */
function renderExpensesView(area) {
  const isAdmin = session.role === 'admin';
  const html = [];

  html.push('<div class="filter-bar">');
  html.push(`<div class="field"><label>From Date</label><input type="date" id="filterFrom"></div>`);
  html.push(`<div class="field"><label>To Date</label><input type="date" id="filterTo"></div>`);
  html.push(`<div class="field"><label>Category</label><select id="filterCategory"><option value="">All</option>${activeCategories().map(c => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join('')}</select></div>`);
  html.push(`<div class="field"><label>Payment Method</label><select id="filterPayment"><option value="">All</option>${PAYMENT_METHODS.map(p => `<option value="${p}">${p}</option>`).join('')}</select></div>`);
  html.push(`<div class="field"><label>Search</label><input type="text" id="filterSearch" placeholder="Description, supplier, ref..."></div>`);
  html.push(`<button class="btn btn-ghost" id="clearFiltersBtn">Clear Filters</button>`);
  html.push(`<button class="btn btn-primary" id="exportCsvBtn">⬇ Export CSV</button>`);
  html.push('</div>');

  html.push('<div class="summary-grid" id="filteredSummary"></div>');
  html.push('<div id="expenseTableHolder"></div>');

  area.innerHTML = html.join('');

  const rerender = () => {
    const from = document.getElementById('filterFrom').value;
    const to = document.getElementById('filterTo').value;
    const cat = document.getElementById('filterCategory').value;
    const pay = document.getElementById('filterPayment').value;
    const search = document.getElementById('filterSearch').value.trim().toLowerCase();

    let list = visibleExpenses().filter(e => {
      if (from && e.date < from) return false;
      if (to && e.date > to) return false;
      if (cat && e.category !== cat) return false;
      if (pay && e.paymentMethod !== pay) return false;
      if (search) {
        const hay = [e.description, e.supplier, e.reference, e.notes].map(v => (v || '').toLowerCase()).join(' ');
        if (!hay.includes(search)) return false;
      }
      return true;
    }).sort((a, b) => (b.date || '').localeCompare(a.date || ''));

    const total = list.reduce((s, e) => s + Number(e.amount || 0), 0);
    document.getElementById('filteredSummary').innerHTML =
      summaryCard('Filtered Total', fmtMoney(total, ''), '💵', true) +
      summaryCard('Record Count', String(list.length), '📋');

    const holder = document.getElementById('expenseTableHolder');
    holder.innerHTML = buildExpenseTable(list, isAdmin);
    wireExpenseRowActions(holder);

    document.getElementById('exportCsvBtn').onclick = () => exportCsv(list);
  };

  ['filterFrom', 'filterTo', 'filterCategory', 'filterPayment', 'filterSearch'].forEach(id => {
    document.getElementById(id).addEventListener('input', rerender);
    document.getElementById(id).addEventListener('change', rerender);
  });
  document.getElementById('clearFiltersBtn').addEventListener('click', () => {
    ['filterFrom', 'filterTo', 'filterCategory', 'filterPayment', 'filterSearch'].forEach(id => document.getElementById(id).value = '');
    rerender();
  });

  rerender();
}

function exportCsv(list) {
  if (list.length === 0) {
    showToast('No expenses to export.', 'error');
    return;
  }
  const fields = allFieldsForForm();
  const headers = ['Created By', ...fields.map(f => f.label)];
  const rows = list.map(e => {
    const base = [e.createdBy || ''];
    fields.forEach(f => {
      let v = e[f.id];
      if (f.id === 'category') v = getCategoryName(e.category);
      base.push(v ?? '');
    });
    return base;
  });

  const csvLines = [headers, ...rows].map(row =>
    row.map(cell => {
      const s = String(cell ?? '');
      if (/[",\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
      return s;
    }).join(',')
  );
  const csvContent = csvLines.join('\r\n');
  downloadFile(csvContent, `cardamom-expenses-${todayStr()}.csv`, 'text/csv;charset=utf-8;');
  showToast('CSV export downloaded.', 'success');
}

function downloadFile(content, filename, mime) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/* ===================================================================
   EXPENSE MODAL (Add/Edit) — dynamic fields
   =================================================================== */
function openExpenseModal(expenseId) {
  editingExpenseId = expenseId || null;
  const expense = editingExpenseId ? DB.expenses.find(e => e.id === editingExpenseId) : null;

  document.getElementById('expenseModalTitle').textContent = expense ? 'Edit Expense' : 'Add Expense';
  document.getElementById('expenseFormError').classList.add('hidden');

  const fields = allFieldsForForm();
  const container = document.getElementById('expenseFormFields');
  container.innerHTML = fields.map(f => renderFieldInput(f, expense)).join('');

  document.getElementById('expenseModalOverlay').classList.remove('hidden');
}

function renderFieldInput(f, expense) {
  const val = expense ? expense[f.id] : (f.id === 'date' ? todayStr() : '');
  const req = f.required ? 'required' : '';
  const fullWidth = (f.type === 'text' && (f.id === 'notes' || f.id === 'description')) ? ' full-width' : '';
  let input = '';

  if (f.id === 'category') {
    const opts = activeCategories().map(c => `<option value="${c.id}" ${expense && expense.category === c.id ? 'selected' : ''}>${escapeHtml(c.name)}</option>`).join('');
    input = `<select id="f_${f.id}" ${req}><option value="">Select category</option>${opts}</select>`;
  } else if (f.type === 'dropdown') {
    const opts = (f.options || []).map(o => `<option value="${escapeHtml(o)}" ${val === o ? 'selected' : ''}>${escapeHtml(o)}</option>`).join('');
    input = `<select id="f_${f.id}" ${req}><option value="">Select...</option>${opts}</select>`;
  } else if (f.type === 'number') {
    input = `<input type="number" step="0.01" id="f_${f.id}" value="${val !== undefined && val !== null ? val : ''}" ${req}>`;
  } else if (f.type === 'date') {
    input = `<input type="date" id="f_${f.id}" value="${val || ''}" ${req}>`;
  } else {
    input = `<input type="text" id="f_${f.id}" value="${escapeHtml(val || '')}" ${req}>`;
  }

  return `<div class="field${fullWidth}" data-field-id="${f.id}">
    <label>${escapeHtml(f.label)}${f.required ? ' *' : ''}</label>
    ${input}
  </div>`;
}

function closeExpenseModal() {
  document.getElementById('expenseModalOverlay').classList.add('hidden');
  editingExpenseId = null;
}

function handleExpenseSubmit(e) {
  e.preventDefault();
  const fields = allFieldsForForm();
  const data = {};
  for (const f of fields) {
    const el = document.getElementById('f_' + f.id);
    let v = el.value;
    if (f.required && !v) {
      document.getElementById('expenseFormError').textContent = `"${f.label}" is required.`;
      document.getElementById('expenseFormError').classList.remove('hidden');
      return;
    }
    if (f.type === 'number' && v !== '' && isNaN(Number(v))) {
      document.getElementById('expenseFormError').textContent = `"${f.label}" must be a valid number.`;
      document.getElementById('expenseFormError').classList.remove('hidden');
      return;
    }
    if (f.id === 'amount' && Number(v) < 0) {
      document.getElementById('expenseFormError').textContent = `Amount cannot be negative.`;
      document.getElementById('expenseFormError').classList.remove('hidden');
      return;
    }
    data[f.id] = v;
  }

  if (editingExpenseId) {
    const existing = DB.expenses.find(e2 => e2.id === editingExpenseId);
    Object.assign(existing, data);
    showToast('Expense updated.', 'success');
  } else {
    DB.expenses.push({
      id: uid(),
      ...data,
      createdBy: session.username,
      createdAt: Date.now()
    });
    showToast('Expense added.', 'success');
  }
  saveDB();
  closeExpenseModal();
  navigateTo(currentView);
}

/* ===================================================================
   CATEGORIES VIEW (admin only)
   =================================================================== */
function renderCategoriesView(area) {
  const html = [];
  html.push('<div class="actions-row"><button class="btn btn-primary" id="addCategoryBtn">+ Add Category</button></div>');
  html.push('<div class="manage-list" id="categoryList"></div>');
  area.innerHTML = html.join('');

  document.getElementById('addCategoryBtn').addEventListener('click', () => openCategoryModal());

  const list = document.getElementById('categoryList');
  const sorted = [...DB.categories].sort((a, b) => a.order - b.order);
  list.innerHTML = sorted.map((c, idx) => `
    <div class="manage-row ${c.active ? '' : 'inactive'}">
      <div class="order-btns">
        <button class="icon-btn" data-action="move-up" data-id="${c.id}" ${idx === 0 ? 'disabled' : ''}>▲</button>
        <button class="icon-btn" data-action="move-down" data-id="${c.id}" ${idx === sorted.length - 1 ? 'disabled' : ''}>▼</button>
      </div>
      <div class="grow"><strong>${escapeHtml(c.name)}</strong> ${c.active ? '' : '<span class="tag-sm">Inactive</span>'}</div>
      <button class="btn btn-ghost btn-sm" data-action="edit-cat" data-id="${c.id}">Rename</button>
      <button class="btn btn-ghost btn-sm" data-action="toggle-cat" data-id="${c.id}">${c.active ? 'Deactivate' : 'Activate'}</button>
    </div>
  `).join('');

  list.querySelectorAll('[data-action="edit-cat"]').forEach(btn => btn.addEventListener('click', () => openCategoryModal(btn.dataset.id)));
  list.querySelectorAll('[data-action="toggle-cat"]').forEach(btn => btn.addEventListener('click', () => {
    const cat = DB.categories.find(c => c.id === btn.dataset.id);
    cat.active = !cat.active;
    saveDB();
    showToast(`Category ${cat.active ? 'activated' : 'deactivated'}. Existing expense records are preserved.`, 'success');
    navigateTo('categories');
  }));
  list.querySelectorAll('[data-action="move-up"]').forEach(btn => btn.addEventListener('click', () => reorderCategory(btn.dataset.id, -1)));
  list.querySelectorAll('[data-action="move-down"]').forEach(btn => btn.addEventListener('click', () => reorderCategory(btn.dataset.id, 1)));
}

function reorderCategory(id, dir) {
  const sorted = [...DB.categories].sort((a, b) => a.order - b.order);
  const idx = sorted.findIndex(c => c.id === id);
  const swapIdx = idx + dir;
  if (swapIdx < 0 || swapIdx >= sorted.length) return;
  const tmp = sorted[idx].order;
  sorted[idx].order = sorted[swapIdx].order;
  sorted[swapIdx].order = tmp;
  saveDB();
  navigateTo('categories');
}

function openCategoryModal(id) {
  editingCategoryId = id || null;
  const cat = id ? DB.categories.find(c => c.id === id) : null;
  document.getElementById('categoryModalTitle').textContent = cat ? 'Rename Category' : 'Add Category';
  document.getElementById('categoryNameInput').value = cat ? cat.name : '';
  document.getElementById('categoryModalOverlay').classList.remove('hidden');
}
function closeCategoryModal() {
  document.getElementById('categoryModalOverlay').classList.add('hidden');
  editingCategoryId = null;
}
function handleCategorySubmit(e) {
  e.preventDefault();
  const name = document.getElementById('categoryNameInput').value.trim();
  if (!name) return;
  if (DB.categories.some(c => c.name.toLowerCase() === name.toLowerCase() && c.id !== editingCategoryId)) {
    showToast('A category with this name already exists.', 'error');
    return;
  }
  if (editingCategoryId) {
    const cat = DB.categories.find(c => c.id === editingCategoryId);
    cat.name = name;
    showToast('Category renamed. Existing expense records remain linked.', 'success');
  } else {
    const maxOrder = DB.categories.reduce((m, c) => Math.max(m, c.order), -1);
    DB.categories.push({ id: uid(), name, active: true, order: maxOrder + 1 });
    showToast('Category added.', 'success');
  }
  saveDB();
  closeCategoryModal();
  navigateTo('categories');
}

/* ===================================================================
   CUSTOM FIELDS VIEW (admin only)
   =================================================================== */
function renderFieldsView(area) {
  const html = [];
  html.push('<div class="actions-row"><button class="btn btn-primary" id="addFieldBtn">+ Add Custom Field</button></div>');

  html.push('<div class="section-block"><div class="section-head"><h3>Built-in Fields</h3></div><div class="manage-list">');
  BUILTIN_FIELDS.forEach(f => {
    html.push(`<div class="manage-row"><div class="grow"><strong>${escapeHtml(f.label)}</strong> <span class="tag-sm">${f.type}</span> ${f.required ? '<span class="tag-sm">Required</span>' : ''}</div><span class="tag-sm">System</span></div>`);
  });
  html.push('</div></div>');

  html.push('<div class="section-block"><div class="section-head"><h3>Custom Fields</h3></div><div class="manage-list" id="customFieldList"></div></div>');

  area.innerHTML = html.join('');
  document.getElementById('addFieldBtn').addEventListener('click', () => openFieldModal());

  const list = document.getElementById('customFieldList');
  if (DB.customFields.length === 0) {
    list.innerHTML = '<div class="card empty-state">No custom fields yet. Add one to capture extra plantation-specific data.</div>';
    return;
  }
  list.innerHTML = DB.customFields.map(f => `
    <div class="manage-row ${f.active === false ? 'inactive' : ''}">
      <div class="grow"><strong>${escapeHtml(f.label)}</strong> <span class="tag-sm">${f.type}</span> ${f.required ? '<span class="tag-sm">Required</span>' : ''} ${f.active === false ? '<span class="tag-sm">Inactive</span>' : ''}</div>
      <button class="btn btn-ghost btn-sm" data-action="edit-field" data-id="${f.id}">Edit</button>
      <button class="btn btn-ghost btn-sm" data-action="toggle-field" data-id="${f.id}">${f.active === false ? 'Activate' : 'Deactivate'}</button>
    </div>
  `).join('');

  list.querySelectorAll('[data-action="edit-field"]').forEach(btn => btn.addEventListener('click', () => openFieldModal(btn.dataset.id)));
  list.querySelectorAll('[data-action="toggle-field"]').forEach(btn => btn.addEventListener('click', () => {
    const f = DB.customFields.find(x => x.id === btn.dataset.id);
    f.active = f.active === false ? true : false;
    saveDB();
    showToast(`Field ${f.active === false ? 'deactivated' : 'activated'}. Existing expense data is preserved.`, 'success');
    navigateTo('fields');
  }));
}

function openFieldModal(id) {
  editingFieldId = id || null;
  const f = id ? DB.customFields.find(x => x.id === id) : null;
  document.getElementById('fieldModalTitle').textContent = f ? 'Edit Custom Field' : 'Add Custom Field';
  document.getElementById('fieldLabelInput').value = f ? f.label : '';
  document.getElementById('fieldTypeInput').value = f ? f.type : 'text';
  document.getElementById('fieldOptionsInput').value = f && f.options ? f.options.join(', ') : '';
  document.getElementById('fieldRequiredInput').checked = f ? !!f.required : false;
  document.getElementById('fieldOptionsWrap').style.display = (f && f.type === 'dropdown') ? 'block' : 'none';
  document.getElementById('fieldModalOverlay').classList.remove('hidden');
}
function closeFieldModal() {
  document.getElementById('fieldModalOverlay').classList.add('hidden');
  editingFieldId = null;
}
function handleFieldSubmit(e) {
  e.preventDefault();
  const label = document.getElementById('fieldLabelInput').value.trim();
  const type = document.getElementById('fieldTypeInput').value;
  const required = document.getElementById('fieldRequiredInput').checked;
  const options = document.getElementById('fieldOptionsInput').value.split(',').map(s => s.trim()).filter(Boolean);

  if (!label) return;
  if (type === 'dropdown' && options.length === 0) {
    showToast('Please provide at least one dropdown option.', 'error');
    return;
  }

  if (editingFieldId) {
    const f = DB.customFields.find(x => x.id === editingFieldId);
    f.label = label; f.type = type; f.required = required; f.options = options;
    showToast('Field updated. Existing expense records are preserved.', 'success');
  } else {
    const id = 'custom_' + uid();
    DB.customFields.push({ id, label, type, required, options, active: true });
    showToast('Custom field added.', 'success');
  }
  saveDB();
  closeFieldModal();
  navigateTo('fields');
}

/* ===================================================================
   USERS VIEW (admin only)
   =================================================================== */
function renderUsersView(area) {
  const html = [];
  html.push('<div class="actions-row"><button class="btn btn-primary" id="addUserBtn">+ Add User</button></div>');
  html.push('<div class="table-wrap"><table><thead><tr><th>Username</th><th>Role</th><th>Status</th><th>Actions</th></tr></thead><tbody>');
  DB.users.forEach(u => {
    html.push(`<tr>
      <td data-label="Username">${escapeHtml(u.username)}</td>
      <td data-label="Role"><span class="cat-pill">${u.role}</span></td>
      <td data-label="Status">${u.active ? 'Active' : '<span class="tag-sm">Inactive</span>'}</td>
      <td data-label="Actions">
        <div class="row-actions">
          <button class="icon-btn" data-action="edit-user" data-id="${u.id}">✏️</button>
          <button class="icon-btn" data-action="toggle-user" data-id="${u.id}">${u.active ? '🚫' : '✅'}</button>
        </div>
      </td>
    </tr>`);
  });
  html.push('</tbody></table></div>');
  area.innerHTML = html.join('');

  document.getElementById('addUserBtn').addEventListener('click', () => openUserModal());
  area.querySelectorAll('[data-action="edit-user"]').forEach(btn => btn.addEventListener('click', () => openUserModal(btn.dataset.id)));
  area.querySelectorAll('[data-action="toggle-user"]').forEach(btn => btn.addEventListener('click', () => {
    const u = DB.users.find(x => x.id === btn.dataset.id);
    if (u.username === session.username && u.active) {
      showToast('You cannot deactivate your own account while logged in.', 'error');
      return;
    }
    u.active = !u.active;
    saveDB();
    showToast(`User ${u.active ? 'activated' : 'deactivated'}.`, 'success');
    navigateTo('users');
  }));
}

function openUserModal(id) {
  editingUserId = id || null;
  const u = id ? DB.users.find(x => x.id === id) : null;
  document.getElementById('userModalTitle').textContent = u ? 'Edit User' : 'Add User';
  document.getElementById('userUsernameInput').value = u ? u.username : '';
  document.getElementById('userPasswordInput').value = '';
  document.getElementById('userRoleInput').value = u ? u.role : 'user';
  document.getElementById('userActiveInput').checked = u ? u.active : true;
  document.getElementById('userModalOverlay').classList.remove('hidden');
}
function closeUserModal() {
  document.getElementById('userModalOverlay').classList.add('hidden');
  editingUserId = null;
}
function handleUserSubmit(e) {
  e.preventDefault();
  const username = document.getElementById('userUsernameInput').value.trim();
  const password = document.getElementById('userPasswordInput').value;
  const role = document.getElementById('userRoleInput').value;
  const active = document.getElementById('userActiveInput').checked;

  if (!username) return;
  if (isUsernameTaken(username, editingUserId)) {
    showToast('Username already exists.', 'error');
    return;
  }

  if (editingUserId) {
    const u = DB.users.find(x => x.id === editingUserId);
    if (u.username === session.username && (role !== 'admin' || !active)) {
      showToast('You cannot remove your own admin access or deactivate yourself.', 'error');
      return;
    }
    u.username = username;
    if (password) u.password = password;
    u.role = role;
    u.active = active;
    showToast('User updated.', 'success');
  } else {
    if (!password) {
      showToast('Password is required for a new user.', 'error');
      return;
    }
    DB.users.push({ id: uid(), username, password, role, active });
    showToast('User created.', 'success');
  }
  saveDB();
  closeUserModal();
  navigateTo('users');
}

/* ===================================================================
   REPORTS VIEW (admin only)
   =================================================================== */
function renderReportsView(area) {
  const expenses = DB.expenses;
  const byMonth = {};
  expenses.forEach(e => {
    const mk = monthKey(e.date) || 'Unknown';
    byMonth[mk] = (byMonth[mk] || 0) + Number(e.amount || 0);
  });
  const monthRows = Object.entries(byMonth).sort((a, b) => b[0].localeCompare(a[0]));

  const byUser = {};
  expenses.forEach(e => {
    const who = e.createdBy || 'Unknown';
    byUser[who] = (byUser[who] || 0) + Number(e.amount || 0);
  });
  const userRows = Object.entries(byUser).sort((a, b) => b[1] - a[1]);

  const html = [];
  html.push('<div class="actions-row"><button class="btn btn-primary" id="exportAllCsvBtn">⬇ Export All Expenses (CSV)</button></div>');

  html.push('<div class="section-block"><div class="section-head"><h3>Monthly Expense Summary</h3></div>');
  if (monthRows.length === 0) {
    html.push('<div class="card empty-state">No data yet.</div>');
  } else {
    html.push('<div class="table-wrap"><table><thead><tr><th>Month</th><th>Total</th></tr></thead><tbody>');
    monthRows.forEach(([m, amt]) => html.push(`<tr><td data-label="Month">${m}</td><td data-label="Total" class="amount-cell">${fmtMoney(amt, '')}</td></tr>`));
    html.push('</tbody></table></div>');
  }
  html.push('</div>');

  html.push('<div class="section-block"><div class="section-head"><h3>Expenses by User</h3></div>');
  if (userRows.length === 0) {
    html.push('<div class="card empty-state">No data yet.</div>');
  } else {
    html.push('<div class="table-wrap"><table><thead><tr><th>User</th><th>Total</th></tr></thead><tbody>');
    userRows.forEach(([u, amt]) => html.push(`<tr><td data-label="User">${escapeHtml(u)}</td><td data-label="Total" class="amount-cell">${fmtMoney(amt, '')}</td></tr>`));
    html.push('</tbody></table></div>');
  }
  html.push('</div>');

  area.innerHTML = html.join('');
  document.getElementById('exportAllCsvBtn').addEventListener('click', () => exportCsv(DB.expenses));
}

/* ===================================================================
   DATA MANAGEMENT VIEW (JSON backup/restore, reset)
   =================================================================== */
function renderDataView(area) {
  const html = [];
  html.push(`<div class="card section-block">
    <h3>Backup (Export JSON)</h3>
    <p>Download a full backup of all application data${session.role === 'admin' ? '' : ' you have access to'} as a JSON file. Keep this file safe — it contains all expense and configuration data.</p>
    <button class="btn btn-primary" id="exportJsonBtn">⬇ Export Full Backup (JSON)</button>
  </div>`);

  html.push(`<div class="card section-block">
    <h3>Restore (Import JSON)</h3>
    <p>Restore data from a previously exported JSON backup. ${session.role === 'admin' ? 'This will replace all current application data.' : 'Only an admin can restore a full backup.'}</p>
    ${session.role === 'admin' ? '<button class="btn btn-primary" id="importJsonBtn">⬆ Import Backup</button>' : '<button class="btn btn-ghost" disabled>Admin only</button>'}
  </div>`);

  if (session.role === 'admin') {
    html.push(`<div class="card">
      <h3>Reset Application</h3>
      <p>Permanently erase all users, categories, fields and expenses stored in this browser. This cannot be undone.</p>
      <button class="btn btn-danger" id="resetDataBtn">Reset All Data</button>
    </div>`);
  }

  html.push(`<p class="security-note" style="margin-top:20px;">⚠️ Reminder: all data lives only in this browser's Local Storage. Clearing browser data, using a different browser/device, or private/incognito mode will not show this data. Export a JSON backup regularly if this data matters to you.</p>`);

  area.innerHTML = html.join('');

  document.getElementById('exportJsonBtn').addEventListener('click', () => {
    const payload = session.role === 'admin' ? DB : { ...DB, expenses: visibleExpenses() };
    downloadFile(JSON.stringify(payload, null, 2), `cardamom-backup-${todayStr()}.json`, 'application/json');
    showToast('Backup downloaded.', 'success');
  });

  if (session.role === 'admin') {
    document.getElementById('importJsonBtn').addEventListener('click', () => {
      showConfirm('Import Backup', 'Importing will replace ALL current data in this browser with the contents of the selected file. Continue?', () => {
        document.getElementById('importFileInput').click();
      });
    });
    document.getElementById('resetDataBtn').addEventListener('click', () => {
      showConfirm('Reset Application', 'This will permanently erase all data stored in this browser. This cannot be undone.', () => {
        localStorage.removeItem(STORAGE_KEY);
        sessionStorage.removeItem(SESSION_KEY);
        DB = defaultDB();
        session = null;
        showToast('Application data reset.', 'success');
        location.reload();
      });
    });
  }
}

function handleImportFile(e) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (evt) => {
    try {
      const parsed = JSON.parse(evt.target.result);
      if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.expenses)) {
        throw new Error('Invalid backup file structure.');
      }
      DB = {
        setupComplete: true,
        users: Array.isArray(parsed.users) && parsed.users.length ? parsed.users : DB.users,
        categories: Array.isArray(parsed.categories) && parsed.categories.length ? parsed.categories : DB.categories,
        customFields: Array.isArray(parsed.customFields) ? parsed.customFields : [],
        expenses: parsed.expenses
      };
      saveDB();
      showToast('Backup imported successfully.', 'success');
      navigateTo(currentView);
    } catch (err) {
      showToast('Import failed: file is not a valid backup (' + err.message + ').', 'error');
    } finally {
      e.target.value = '';
    }
  };
  reader.onerror = () => showToast('Failed to read the selected file.', 'error');
  reader.readAsText(file);
}
