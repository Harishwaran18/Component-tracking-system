/* Circuit — application shell, router and views */
(function () {
  'use strict';

  const U = window.UI;
  const { icon, esc, fmtDate, fmtDateTime, timeAgo, fmtNum, fmtMoney, statusBadge, roleBadge, activeBadge,
    toast, modal, confirmDialog, lineChart, barList, emptyState, renderPager, debounce, stockMeter } = U;

  const state = { user: null, route: 'dashboard' };
  const viewEl = () => document.getElementById('view');
  const isAdmin = () => state.user && state.user.role === 'admin';
  const canManage = () => state.user && (state.user.role === 'admin' || state.user.role === 'staff');

  const PAGE_META = {
    dashboard: ['Dashboard', 'Laboratory overview'],
    inventory: ['Inventory', 'Components, stock levels and QR codes'],
    students: ['Students', 'Registered students and their loans'],
    transactions: ['Transactions', 'Issues, returns, losses and overdue items'],
    users: ['Users', 'Accounts and role-based access'],
    audit: ['Audit Log', 'Every change made in the system'],
  };

  const fmtLocalInput = (date) => {
    const d = new Date(date);
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    return d.toISOString().slice(0, 16);
  };
  const errMsg = (err) => {
    if (err && err.details && err.details.length) return err.details.map((d) => d.message).join('; ');
    return (err && err.message) || 'Something went wrong';
  };
  const handleErr = (err) => {
    if (err && err.status === 401) return;
    toast('error', 'Request failed', errMsg(err));
    if (window.console) console.error(err);
  };

  /* ============================================================
     Boot & auth
     ============================================================ */
  function showLogin() {
    document.getElementById('shell').hidden = true;
    document.getElementById('login-screen').hidden = false;
    const pw = document.getElementById('login-password');
    if (pw) pw.value = '';
  }

  function showShell() {
    document.getElementById('login-screen').hidden = true;
    document.getElementById('shell').hidden = false;
    updateUserChip();
    document.querySelectorAll('.admin-only').forEach((el) => { el.hidden = !isAdmin(); });
    refreshOverdueBadge();
  }

  function updateUserChip() {
    if (!state.user) return;
    const name = state.user.full_name || state.user.username;
    document.getElementById('user-name').textContent = name;
    document.getElementById('user-avatar').textContent = name.charAt(0).toUpperCase();
    const roleEl = document.getElementById('user-role');
    roleEl.textContent = state.user.role;
    roleEl.className = `role-badge ${state.user.role}`;
  }

  async function refreshOverdueBadge() {
    try {
      const s = await Api.get('/api/dashboard/summary');
      const n = s.transactions.overdue;
      const el = document.getElementById('nav-overdue');
      if (n > 0) { el.textContent = n; el.hidden = false; } else { el.hidden = true; }
    } catch { /* ignore */ }
  }

  function onLogin(user) {
    state.user = user;
    showShell();
    if (!location.hash) location.hash = '#/dashboard';
    route();
  }

  async function doLogout() {
    await Api.logout();
    state.user = null;
    showLogin();
    toast('info', 'Signed out', 'Your session has ended.');
  }

  function bindLogin() {
    const form = document.getElementById('login-form');
    const errBox = document.getElementById('login-error');
    const submit = document.getElementById('login-submit');
    const toggle = document.getElementById('toggle-password');
    const pw = document.getElementById('login-password');
    toggle.addEventListener('click', () => {
      const show = pw.type === 'password';
      pw.type = show ? 'text' : 'password';
      toggle.textContent = show ? 'Hide' : 'Show';
    });
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      errBox.hidden = true;
      submit.classList.add('is-loading');
      submit.disabled = true;
      try {
        const data = await Api.login(
          document.getElementById('login-username').value.trim(),
          pw.value
        );
        submit.classList.remove('is-loading');
        submit.disabled = false;
        toast('success', 'Welcome back', `Signed in as ${data.user.username}`);
        onLogin(data.user);
      } catch (err) {
        submit.classList.remove('is-loading');
        submit.disabled = false;
        errBox.textContent = errMsg(err);
        errBox.hidden = false;
      }
    });
  }

  function bindShell() {
    document.getElementById('logout-btn').addEventListener('click', doLogout);
    document.getElementById('refresh-btn').addEventListener('click', () => route(true));
    const sidebar = document.getElementById('sidebar');
    const hamburger = document.getElementById('hamburger');
    let scrim = document.querySelector('.nav-scrim');
    if (!scrim) {
      scrim = document.createElement('div');
      scrim.className = 'nav-scrim';
      document.body.appendChild(scrim);
    }
    const closeSidebar = () => { sidebar.classList.remove('open'); scrim.classList.remove('show'); };
    hamburger.addEventListener('click', () => {
      sidebar.classList.toggle('open');
      scrim.classList.toggle('show', sidebar.classList.contains('open'));
    });
    scrim.addEventListener('click', closeSidebar);
    document.querySelectorAll('.nav-item').forEach((a) => a.addEventListener('click', closeSidebar));
    document.getElementById('modal-root').addEventListener('click', (e) => {
      const closeBtn = e.target.closest('[data-act="close"]');
      if (!closeBtn) return;
      const overlay = closeBtn.closest('.modal-overlay');
      if (overlay) { overlay.remove(); document.body.style.overflow = ''; }
    });
    window.addEventListener('auth:logout', () => {
      state.user = null;
      showLogin();
      toast('error', 'Session expired', 'Please sign in again.');
    });
    setInterval(() => {
      const el = document.getElementById('clock');
      if (el) el.textContent = new Date().toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    }, 1000);
  }

  /* ============================================================
     Router
     ============================================================ */
  function setPage(title, subtitle) {
    document.getElementById('page-title').textContent = title;
    document.getElementById('page-subtitle').textContent = subtitle;
    document.title = `${title} · Circuit`;
  }

  const VIEWS = {
    dashboard: viewDashboard,
    inventory: viewInventory,
    students: viewStudents,
    transactions: viewTransactions,
    users: viewUsers,
    audit: viewAudit,
  };

  function route() {
    if (!state.user) return;
    let r = (location.hash || '').replace(/^#\/?/, '') || 'dashboard';
    if (!VIEWS[r]) r = 'dashboard';
    if ((r === 'users' || r === 'audit') && !isAdmin()) r = 'dashboard';
    state.route = r;
    document.querySelectorAll('.nav-item').forEach((a) => a.classList.toggle('active', a.dataset.route === r));
    const [title, sub] = PAGE_META[r];
    setPage(title, sub);
    document.getElementById('sidebar').classList.remove('open');
    document.querySelector('.nav-scrim')?.classList.remove('show');
    viewEl().innerHTML = '';
    Promise.resolve(VIEWS[r]()).catch(handleErr);
  }

  /* ============================================================
     Dashboard
     ============================================================ */
  function kpi({ label, value, sub, iconName, tone = '' }) {
    return `<div class="kpi ${tone}">
      <div class="kpi-top"><span class="kpi-label">${esc(label)}</span><span class="kpi-icon">${icon(iconName)}</span></div>
      <div class="kpi-value">${value}</div>
      <div class="kpi-sub">${esc(sub || '')}</div>
    </div>`;
  }

  async function viewDashboard() {
    const v = viewEl();
    v.innerHTML = `
      <div class="grid kpi-grid" id="dash-kpis">
        ${Array.from({ length: 6 }).map(() => '<div class="kpi"><div class="skeleton sk-line" style="width:50%"></div><div class="skeleton" style="height:30px;margin-top:12px"></div></div>').join('')}
      </div>
      <div class="grid cols-2 mt-16">
        <div class="card">
          <div class="card-head"><h3>Issue &amp; return activity</h3><span class="hint">last 30 days</span></div>
          <div class="chart-legend"><span><i style="background:#22d3ee"></i>Issued</span><span><i style="background:#a855f7"></i>Returned</span></div>
          <div class="chart-wrap" id="dash-activity"><div class="skeleton" style="height:200px"></div></div>
        </div>
        <div class="card">
          <div class="card-head"><h3>Inventory by category</h3><a class="card-link" href="#/inventory">View all</a></div>
          <div id="dash-cats"><div class="skeleton sk-line"></div><div class="skeleton sk-line"></div><div class="skeleton sk-line"></div></div>
        </div>
      </div>
      <div class="grid cols-2 mt-16">
        <div class="card">
          <div class="card-head"><h3>Recent transactions</h3><a class="card-link" href="#/transactions">View all</a></div>
          <div id="dash-recent"><div class="skeleton sk-line"></div><div class="skeleton sk-line"></div></div>
        </div>
        <div class="card">
          <div class="card-head"><h3>Low stock alerts</h3><span class="hint">at or below minimum</span></div>
          <div id="dash-low"><div class="skeleton sk-line"></div><div class="skeleton sk-line"></div></div>
        </div>
      </div>`;

    const [summary, activity, cats, low, recent] = await Promise.all([
      Api.get('/api/dashboard/summary'),
      Api.get('/api/dashboard/activity?days=30'),
      Api.get('/api/dashboard/category-distribution'),
      Api.get('/api/dashboard/low-stock?limit=6'),
      Api.get('/api/dashboard/recent-transactions?limit=7'),
    ]);

    const c = summary.components;
    const t = summary.transactions;
    document.getElementById('dash-kpis').innerHTML = [
      kpi({ label: 'Components', value: fmtNum(c.total_components), sub: `${fmtNum(c.total_units)} total units`, iconName: 'box' }),
      kpi({ label: 'Available units', value: fmtNum(c.available_units), sub: `${fmtNum(c.issued_units)} currently issued`, iconName: 'check', tone: 'success' }),
      kpi({ label: 'Active loans', value: fmtNum(t.active_loans), sub: `${fmtNum(t.units_out)} units out`, iconName: 'undo' }),
      kpi({ label: 'Overdue', value: fmtNum(t.overdue), sub: 'need follow-up', iconName: 'alert', tone: 'danger' }),
      kpi({ label: 'Low stock', value: fmtNum(c.low_stock), sub: 'at or below minimum', iconName: 'wrench', tone: 'warn' }),
      kpi({ label: 'Students', value: fmtNum(summary.students), sub: `${fmtNum(summary.users)} active users`, iconName: 'users' }),
    ].join('');

    document.getElementById('dash-activity').innerHTML = lineChart(activity.series);
    document.getElementById('dash-cats').innerHTML = barList(cats.data.slice(0, 6), { labelKey: 'category', valueKey: 'available', suffix: ' units' });

    document.getElementById('dash-recent').innerHTML = recent.data.length ? `<div class="activity">${recent.data.map((r) => `
      <div class="activity-item" data-tx="${esc(r.id)}" style="cursor:pointer">
        <div class="activity-dot">${icon('undo')}</div>
        <div class="activity-body"><strong>${esc(r.student_name)} · ${esc(r.component_name)}</strong>
          <span>${esc(r.code)} · ${fmtNum(r.quantity)} units</span></div>
        <div class="activity-meta">${statusBadge(r.status, r.is_overdue)}<div style="margin-top:4px">${timeAgo(r.issued_at)}</div></div>
      </div>`).join('')}</div>` : emptyState('undo', 'No transactions yet', 'Issue a component to get started.');

    document.getElementById('dash-low').innerHTML = low.data.length ? `<div class="activity">${low.data.map((r) => `
      <div class="activity-item">
        <div class="activity-dot" style="background:rgba(251,191,36,.12);color:var(--amber)">${icon('alert')}</div>
        <div class="activity-body"><strong>${esc(r.name)}</strong><span>${esc(r.category)} · ${esc(r.qr_code)}</span></div>
        <div class="activity-meta"><span class="text-warn">${fmtNum(r.available_quantity)}</span> / ${fmtNum(r.min_stock)} min</div>
      </div>`).join('')}</div>` : emptyState('check', 'Stock levels are healthy', 'No components are below their minimum.');

    v.querySelectorAll('[data-tx]').forEach((el) => el.addEventListener('click', () => openTransactionDetail(el.dataset.tx)));
    refreshOverdueBadge();
  }

  /* ============================================================
     Inventory
     ============================================================ */
  const inv = { search: '', category: '', lowStock: false, page: 1, pageSize: 12, sort: 'name', order: 'asc' };

  async function viewInventory() {
    const v = viewEl();
    let cats = [];
    try { cats = (await Api.get('/api/components/categories')).categories; } catch { /* ignore */ }
    v.innerHTML = `
      <div class="toolbar">
        <div class="search-box">${icon('search')}<input id="inv-search" placeholder="Search name, QR code, location…" value="${esc(inv.search)}" /></div>
        <select id="inv-cat">
          <option value="">All categories</option>
          ${cats.map((c) => `<option value="${esc(c.category)}" ${c.category === inv.category ? 'selected' : ''}>${esc(c.category)} (${c.count})</option>`).join('')}
        </select>
        <label class="filter-chip ${inv.lowStock ? 'on' : ''}"><input type="checkbox" id="inv-low" ${inv.lowStock ? 'checked' : ''}/>Low stock only</label>
        <div class="spacer"></div>
        <button class="btn btn-ghost btn-sm" id="inv-export">${icon('download')}Export CSV</button>
        ${canManage() ? `<button class="btn btn-primary btn-sm" id="inv-add">${icon('plus')}Add component</button>` : ''}
      </div>
      <div class="table-wrap"><table>
        <thead><tr><th>Component</th><th>Category</th><th>Location</th><th>Stock</th><th>Condition</th><th class="right">Actions</th></tr></thead>
        <tbody id="inv-body"><tr><td colspan="6"><div class="skeleton sk-line"></div></td></tr></tbody>
      </table></div>
      <div class="pagination" id="inv-pager"></div>`;

    const search = document.getElementById('inv-search');
    search.addEventListener('input', debounce(() => { inv.search = search.value.trim(); inv.page = 1; loadInventory(); }, 300));
    document.getElementById('inv-cat').addEventListener('change', (e) => { inv.category = e.target.value; inv.page = 1; loadInventory(); });
    document.getElementById('inv-low').addEventListener('change', (e) => {
      inv.lowStock = e.target.checked; inv.page = 1;
      e.target.closest('.filter-chip').classList.toggle('on', inv.lowStock);
      loadInventory();
    });
    document.getElementById('inv-export').addEventListener('click', () => Api.download('/api/components/export/csv', 'components.csv').catch(handleErr));
    document.getElementById('inv-add')?.addEventListener('click', () => openComponentForm());
    document.getElementById('inv-body').addEventListener('click', onInventoryAction);
    loadInventory();
  }

  async function loadInventory() {
    const body = document.getElementById('inv-body');
    if (!body) return;
    const params = new URLSearchParams({ page: inv.page, pageSize: inv.pageSize, sort: inv.sort, order: inv.order });
    if (inv.search) params.set('search', inv.search);
    if (inv.category) params.set('category', inv.category);
    if (inv.lowStock) params.set('lowStock', 'true');
    const res = await Api.get(`/api/components?${params}`);
    if (!document.getElementById('inv-body')) return;
    if (!res.data.length) {
      body.innerHTML = `<tr><td colspan="6">${emptyState('box', 'No components found', 'Adjust your filters or add a new component.')}</td></tr>`;
    } else {
      body.innerHTML = res.data.map((c) => `
        <tr>
          <td><div class="cell-main">${esc(c.name)}</div><div class="cell-sub"><span class="qr-code">${esc(c.qr_code)}</span></div></td>
          <td><span class="cell-sub">${esc(c.category)}</span></td>
          <td><span class="cell-sub">${esc(c.location || '—')}</span></td>
          <td>${stockMeter(c.available_quantity, c.total_quantity, c.min_stock)}</td>
          <td><span class="badge ${esc(c.condition)}">${esc(c.condition)}</span></td>
          <td><div class="row-actions">
            <button class="icon-btn" data-act="qr" data-id="${esc(c.id)}" title="QR code">${icon('qr')}</button>
            ${canManage() ? `<button class="icon-btn" data-act="restock" data-id="${esc(c.id)}" title="Restock">${icon('plus')}</button>
            <button class="icon-btn" data-act="edit" data-id="${esc(c.id)}" title="Edit">${icon('edit')}</button>
            <button class="icon-btn danger" data-act="delete" data-id="${esc(c.id)}" title="Deactivate">${icon('trash')}</button>` : ''}
          </div></td>
        </tr>`).join('');
    }
    renderPager(document.getElementById('inv-pager'), res.pagination, (p) => { inv.page = p; loadInventory(); });
    window.__invCache = res.data;
  }

  function onInventoryAction(e) {
    const btn = e.target.closest('button[data-act]');
    if (!btn) return;
    const id = btn.dataset.id;
    const comp = (window.__invCache || []).find((c) => c.id === id);
    if (btn.dataset.act === 'qr') return openQr(id);
    if (!canManage()) return;
    if (btn.dataset.act === 'edit') return openComponentForm(comp);
    if (btn.dataset.act === 'restock') return openRestock(comp);
    if (btn.dataset.act === 'delete') return deactivateComponent(comp);
  }

  function openComponentForm(comp) {
    const isEdit = Boolean(comp);
    const c = comp || {};
    const m = modal({
      title: isEdit ? 'Edit component' : 'New component',
      subtitle: isEdit ? c.qr_code : 'A QR code is generated automatically',
      wide: true,
      body: `<form id="comp-form" class="form-grid">
        <label class="field full"><span>Name *</span><input name="name" required value="${esc(c.name || '')}" placeholder="e.g. Arduino Uno R3" /></label>
        <label class="field"><span>Category *</span><input name="category" required value="${esc(c.category || 'General')}" /></label>
        <label class="field"><span>Location</span><input name="location" value="${esc(c.location || '')}" placeholder="Rack A-1" /></label>
        <label class="field"><span>Total quantity *</span><input name="totalQuantity" type="number" min="0" required value="${c.total_quantity ?? 0}" /></label>
        <label class="field"><span>Minimum stock</span><input name="minStock" type="number" min="0" value="${c.min_stock ?? 0}" /></label>
        <label class="field"><span>Unit cost (₹)</span><input name="unitCost" type="number" min="0" step="0.01" value="${c.unit_cost ?? 0}" /></label>
        <label class="field"><span>Condition</span><select name="condition">
          ${['good', 'fair', 'damaged'].map((x) => `<option value="${x}" ${c.condition === x ? 'selected' : ''}>${x}</option>`).join('')}
        </select></label>
        <label class="field"><span>Unit</span><input name="unit" value="${esc(c.unit || 'pcs')}" /></label>
        <label class="field full"><span>Description</span><textarea name="description" placeholder="Optional notes">${esc(c.description || '')}</textarea></label>
        <div class="full form-error" id="comp-err" hidden></div>
      </form>`,
      footer: `<button class="btn btn-ghost" data-act="cancel">Cancel</button>
               <button class="btn btn-primary" id="comp-save">${isEdit ? 'Save changes' : 'Create component'}</button>`,
    });
    m.el.querySelector('[data-act="cancel"]').addEventListener('click', m.close);
    const save = m.el.querySelector('#comp-save');
    save.addEventListener('click', async () => {
      const f = m.el.querySelector('#comp-form');
      if (!f.reportValidity()) return;
      const fd = new FormData(f);
      const payload = {
        name: fd.get('name').trim(),
        category: fd.get('category').trim(),
        location: fd.get('location').trim() || null,
        totalQuantity: Number(fd.get('totalQuantity')),
        minStock: Number(fd.get('minStock') || 0),
        unitCost: Number(fd.get('unitCost') || 0),
        condition: fd.get('condition'),
        unit: fd.get('unit').trim() || 'pcs',
        description: fd.get('description').trim() || null,
      };
      save.disabled = true;
      try {
        if (isEdit) await Api.patch(`/api/components/${c.id}`, payload);
        else await Api.post('/api/components', payload);
        m.close();
        toast('success', isEdit ? 'Component updated' : 'Component created', payload.name);
        loadInventory();
      } catch (err) {
        const box = m.el.querySelector('#comp-err');
        box.textContent = errMsg(err); box.hidden = false;
      } finally { save.disabled = false; }
    });
  }

  function openRestock(comp) {
    const m = modal({
      title: 'Restock component',
      subtitle: comp.name,
      body: `<form id="restock-form" class="form-grid">
        <label class="field"><span>Quantity to add *</span><input name="quantity" type="number" min="1" required value="1" /></label>
        <label class="field"><span>Unit cost (₹)</span><input name="unitCost" type="number" min="0" step="0.01" value="${comp.unit_cost ?? 0}" /></label>
        <label class="field full"><span>Notes</span><textarea name="notes" placeholder="Optional"></textarea></label>
        <div class="full form-hint">Current stock: ${fmtNum(comp.available_quantity)} available of ${fmtNum(comp.total_quantity)} total.</div>
        <div class="full form-error" id="restock-err" hidden></div>
      </form>`,
      footer: `<button class="btn btn-ghost" data-act="cancel">Cancel</button><button class="btn btn-primary" id="restock-save">Add stock</button>`,
    });
    m.el.querySelector('[data-act="cancel"]').addEventListener('click', m.close);
    m.el.querySelector('#restock-save').addEventListener('click', async () => {
      const f = m.el.querySelector('#restock-form');
      if (!f.reportValidity()) return;
      const fd = new FormData(f);
      try {
        await Api.post(`/api/components/${comp.id}/restock`, {
          quantity: Number(fd.get('quantity')),
          unitCost: Number(fd.get('unitCost') || 0),
          notes: fd.get('notes').trim() || null,
        });
        m.close();
        toast('success', 'Stock updated', `${comp.name} restocked.`);
        loadInventory();
      } catch (err) {
        const box = m.el.querySelector('#restock-err');
        box.textContent = errMsg(err); box.hidden = false;
      }
    });
  }

  async function openQr(id) {
    try {
      const res = await Api.get(`/api/components/${id}/qr`);
      const m = modal({
        title: 'QR code',
        subtitle: res.component.name,
        body: `<div class="qr-preview">
          <img src="${res.dataUrl}" alt="QR code for ${esc(res.component.name)}" />
          <div class="qr-name">${esc(res.component.name)}</div>
          <span class="qr-code">${esc(res.component.qrCode)}</span>
          <div class="form-hint">Scan to look up this component at the lab counter.</div>
        </div>`,
        footer: `<button class="btn btn-ghost" data-act="close">Close</button><button class="btn btn-primary" id="qr-print">${icon('print')} Print label</button>`,
      });
      m.el.querySelector('[data-act="close"]').addEventListener('click', m.close);
      m.el.querySelector('#qr-print').addEventListener('click', () => {
        const w = window.open('', '_blank');
        if (!w) return toast('error', 'Popup blocked', 'Allow popups to print labels.');
        w.document.write(`<html><head><title>${esc(res.component.qrCode)}</title><style>body{font-family:Arial;text-align:center;padding:40px}img{width:320px;height:320px}h2{margin:10px 0 4px}code{color:#555}</style></head><body><img src="${res.dataUrl}" onload="window.print()"/><h2>${esc(res.component.name)}</h2><code>${esc(res.component.qrCode)}</code></body></html>`);
        w.document.close();
      });
    } catch (err) { handleErr(err); }
  }

  async function deactivateComponent(comp) {
    const ok = await confirmDialog({
      title: 'Deactivate component?',
      message: `${comp.name} will be hidden from issue workflows. Components with active loans cannot be deactivated.`,
      confirmText: 'Deactivate', danger: true,
    });
    if (!ok) return;
    try {
      await Api.del(`/api/components/${comp.id}`);
      toast('success', 'Component deactivated', comp.name);
      loadInventory();
    } catch (err) { handleErr(err); }
  }

  /* ============================================================
     Students
     ============================================================ */
  const stu = { search: '', dept: '', active: '', page: 1, pageSize: 12 };

  async function viewStudents() {
    const v = viewEl();
    v.innerHTML = `
      <div class="toolbar">
        <div class="search-box">${icon('search')}<input id="stu-search" placeholder="Search reg no, name, email…" value="${esc(stu.search)}" /></div>
        <input id="stu-dept" placeholder="Department (e.g. ECE)" value="${esc(stu.dept)}" style="width:190px" />
        <select id="stu-active">
          <option value="">All statuses</option>
          <option value="true" ${stu.active === 'true' ? 'selected' : ''}>Active only</option>
          <option value="false" ${stu.active === 'false' ? 'selected' : ''}>Inactive only</option>
        </select>
        <div class="spacer"></div>
        ${canManage() ? `<button class="btn btn-primary btn-sm" id="stu-add">${icon('plus')}Add student</button>` : ''}
      </div>
      <div class="table-wrap"><table>
        <thead><tr><th>Reg No</th><th>Student</th><th>Department</th><th>Active loans</th><th>Status</th><th class="right">Actions</th></tr></thead>
        <tbody id="stu-body"><tr><td colspan="6"><div class="skeleton sk-line"></div></td></tr></tbody>
      </table></div>
      <div class="pagination" id="stu-pager"></div>`;

    const search = document.getElementById('stu-search');
    search.addEventListener('input', debounce(() => { stu.search = search.value.trim(); stu.page = 1; loadStudents(); }, 300));
    document.getElementById('stu-dept').addEventListener('input', debounce((e) => { stu.dept = e.target.value.trim(); stu.page = 1; loadStudents(); }, 350));
    document.getElementById('stu-active').addEventListener('change', (e) => { stu.active = e.target.value; stu.page = 1; loadStudents(); });
    document.getElementById('stu-add')?.addEventListener('click', () => openStudentForm());
    document.getElementById('stu-body').addEventListener('click', onStudentAction);
    loadStudents();
  }

  async function loadStudents() {
    const body = document.getElementById('stu-body');
    if (!body) return;
    const params = new URLSearchParams({ page: stu.page, pageSize: stu.pageSize });
    if (stu.search) params.set('search', stu.search);
    if (stu.dept) params.set('dept', stu.dept);
    if (stu.active) params.set('active', stu.active);
    const res = await Api.get(`/api/students?${params}`);
    if (!document.getElementById('stu-body')) return;
    if (!res.data.length) {
      body.innerHTML = `<tr><td colspan="6">${emptyState('users', 'No students found', 'Adjust your filters or add a student.')}</td></tr>`;
    } else {
      body.innerHTML = res.data.map((s) => `
        <tr>
          <td><span class="mono">${esc(s.reg_no)}</span></td>
          <td><div class="cell-main">${esc(s.name)}</div><div class="cell-sub">${esc(s.email || '—')}</div></td>
          <td><span class="cell-sub">${esc(s.dept)}${s.year ? ` · Year ${esc(s.year)}` : ''}</span></td>
          <td>${s.active_loans > 0 ? `<span class="badge issued">${s.active_loans} active</span>` : '<span class="cell-sub">None</span>'}</td>
          <td>${activeBadge(s.is_active)}</td>
          <td><div class="row-actions">
            <button class="icon-btn" data-act="view" data-id="${esc(s.id)}" title="View">${icon('eye')}</button>
            ${canManage() ? `<button class="icon-btn" data-act="edit" data-id="${esc(s.id)}" title="Edit">${icon('edit')}</button>
            <button class="icon-btn danger" data-act="delete" data-id="${esc(s.id)}" title="Deactivate">${icon('trash')}</button>` : ''}
          </div></td>
        </tr>`).join('');
    }
    renderPager(document.getElementById('stu-pager'), res.pagination, (p) => { stu.page = p; loadStudents(); });
    window.__stuCache = res.data;
  }

  function onStudentAction(e) {
    const btn = e.target.closest('button[data-act]');
    if (!btn) return;
    const s = (window.__stuCache || []).find((x) => x.id === btn.dataset.id);
    if (!s) return;
    if (btn.dataset.act === 'view') return openStudentDetail(s.id);
    if (!canManage()) return;
    if (btn.dataset.act === 'edit') return openStudentForm(s);
    if (btn.dataset.act === 'delete') return deactivateStudent(s);
  }

  function openStudentForm(student) {
    const isEdit = Boolean(student);
    const s = student || {};
    const m = modal({
      title: isEdit ? 'Edit student' : 'New student',
      wide: true,
      body: `<form id="stu-form" class="form-grid">
        <label class="field"><span>Registration number *</span><input name="regNo" required value="${esc(s.reg_no || '')}" placeholder="ECE22EC014" /></label>
        <label class="field"><span>Full name *</span><input name="name" required value="${esc(s.name || '')}" /></label>
        <label class="field"><span>Email</span><input name="email" type="email" value="${esc(s.email || '')}" /></label>
        <label class="field"><span>Phone</span><input name="phone" value="${esc(s.phone || '')}" /></label>
        <label class="field"><span>Department</span><input name="dept" value="${esc(s.dept || 'ECE')}" /></label>
        <label class="field"><span>Year</span><input name="year" type="number" min="1" max="6" value="${s.year ?? ''}" /></label>
        <label class="field full"><span>Notes</span><textarea name="notes">${esc(s.notes || '')}</textarea></label>
        <div class="full form-error" id="stu-err" hidden></div>
      </form>`,
      footer: `<button class="btn btn-ghost" data-act="cancel">Cancel</button><button class="btn btn-primary" id="stu-save">${isEdit ? 'Save changes' : 'Create student'}</button>`,
    });
    m.el.querySelector('[data-act="cancel"]').addEventListener('click', m.close);
    m.el.querySelector('#stu-save').addEventListener('click', async () => {
      const f = m.el.querySelector('#stu-form');
      if (!f.reportValidity()) return;
      const fd = new FormData(f);
      const payload = {
        regNo: fd.get('regNo').trim(),
        name: fd.get('name').trim(),
        email: fd.get('email').trim() || null,
        phone: fd.get('phone').trim() || null,
        dept: fd.get('dept').trim() || 'ECE',
        year: fd.get('year') ? Number(fd.get('year')) : null,
        notes: fd.get('notes').trim() || null,
      };
      try {
        if (isEdit) await Api.patch(`/api/students/${s.id}`, payload);
        else await Api.post('/api/students', payload);
        m.close();
        toast('success', isEdit ? 'Student updated' : 'Student created', payload.name);
        loadStudents();
      } catch (err) {
        const box = m.el.querySelector('#stu-err');
        box.textContent = errMsg(err); box.hidden = false;
      }
    });
  }

  async function openStudentDetail(id) {
    try {
      const [detail, txs] = await Promise.all([
        Api.get(`/api/students/${id}`),
        Api.get(`/api/students/${id}/transactions?pageSize=20`),
      ]);
      const s = detail.student;
      const st = detail.stats;
      modal({
        title: s.name,
        subtitle: `${s.reg_no} · ${s.dept}${s.year ? ` · Year ${s.year}` : ''}`,
        wide: true,
        body: `
          <div class="stat-inline" style="margin-bottom:18px">
            <div class="si"><b>${fmtNum(st.total_loans)}</b><span>Total loans</span></div>
            <div class="si"><b>${fmtNum(st.active_loans)}</b><span>Active loans</span></div>
            <div class="si"><b>${fmtNum(st.units_out)}</b><span>Units out</span></div>
            <div class="si"><b>${esc(s.email || '—')}</b><span>Email</span></div>
            <div class="si"><b>${esc(s.phone || '—')}</b><span>Phone</span></div>
          </div>
          <h4 style="margin-bottom:10px;font-size:.9rem">Loan history</h4>
          ${txs.data.length ? `<div class="table-wrap"><table>
            <thead><tr><th>Code</th><th>Component</th><th>Qty</th><th>Status</th><th>Due</th></tr></thead>
            <tbody>${txs.data.map((t) => `<tr>
              <td><span class="mono">${esc(t.code)}</span></td>
              <td>${esc(t.component_name)}</td>
              <td>${fmtNum(t.quantity)}</td>
              <td>${statusBadge(t.status, t.is_overdue)}</td>
              <td class="nowrap">${fmtDate(t.due_at)}</td>
            </tr>`).join('')}</tbody>
          </table></div>` : emptyState('undo', 'No loans yet', 'This student has not borrowed any components.')}`,
        footer: '<button class="btn btn-ghost" data-act="close">Close</button>',
      });
    } catch (err) { handleErr(err); }
  }

  async function deactivateStudent(s) {
    const ok = await confirmDialog({
      title: 'Deactivate student?',
      message: `${s.name} will no longer be able to borrow components. Students with active loans cannot be deactivated.`,
      confirmText: 'Deactivate', danger: true,
    });
    if (!ok) return;
    try {
      await Api.del(`/api/students/${s.id}`);
      toast('success', 'Student deactivated', s.name);
      loadStudents();
    } catch (err) { handleErr(err); }
  }

  /* ============================================================
     Transactions
     ============================================================ */
  const tx = { search: '', status: '', overdue: false, page: 1, pageSize: 12 };

  async function viewTransactions() {
    const v = viewEl();
    v.innerHTML = `
      <div class="toolbar">
        <div class="search-box">${icon('search')}<input id="tx-search" placeholder="Search code, student, component…" value="${esc(tx.search)}" /></div>
        <select id="tx-status">
          <option value="">All statuses</option>
          ${[['issued', 'Issued'], ['partially_returned', 'Partially returned'], ['returned', 'Returned'], ['lost', 'Lost']]
            .map(([val, label]) => `<option value="${val}" ${tx.status === val ? 'selected' : ''}>${label}</option>`).join('')}
        </select>
        <label class="filter-chip ${tx.overdue ? 'on' : ''}"><input type="checkbox" id="tx-overdue" ${tx.overdue ? 'checked' : ''}/>Overdue only</label>
        <div class="spacer"></div>
        <button class="btn btn-ghost btn-sm" id="tx-export">${icon('download')}Export CSV</button>
        ${canManage() ? `<button class="btn btn-primary btn-sm" id="tx-issue">${icon('plus')}Issue component</button>` : ''}
      </div>
      <div class="table-wrap"><table>
        <thead><tr><th>Code</th><th>Student</th><th>Component</th><th>Quantity</th><th>Status</th><th>Due</th><th class="right">Actions</th></tr></thead>
        <tbody id="tx-body"><tr><td colspan="7"><div class="skeleton sk-line"></div></td></tr></tbody>
      </table></div>
      <div class="pagination" id="tx-pager"></div>`;

    const search = document.getElementById('tx-search');
    search.addEventListener('input', debounce(() => { tx.search = search.value.trim(); tx.page = 1; loadTransactions(); }, 300));
    document.getElementById('tx-status').addEventListener('change', (e) => { tx.status = e.target.value; tx.page = 1; loadTransactions(); });
    document.getElementById('tx-overdue').addEventListener('change', (e) => {
      tx.overdue = e.target.checked; tx.page = 1;
      e.target.closest('.filter-chip').classList.toggle('on', tx.overdue);
      loadTransactions();
    });
    document.getElementById('tx-export').addEventListener('click', () => Api.download('/api/transactions/export/csv', 'transactions.csv').catch(handleErr));
    document.getElementById('tx-issue')?.addEventListener('click', openIssueForm);
    document.getElementById('tx-body').addEventListener('click', onTransactionAction);
    loadTransactions();
  }

  async function loadTransactions() {
    const body = document.getElementById('tx-body');
    if (!body) return;
    const params = new URLSearchParams({ page: tx.page, pageSize: tx.pageSize });
    if (tx.search) params.set('search', tx.search);
    if (tx.status) params.set('status', tx.status);
    if (tx.overdue) params.set('overdue', 'true');
    const res = await Api.get(`/api/transactions?${params}`);
    if (!document.getElementById('tx-body')) return;
    if (!res.data.length) {
      body.innerHTML = `<tr><td colspan="7">${emptyState('undo', 'No transactions found', 'Adjust your filters or issue a component.')}</td></tr>`;
    } else {
      body.innerHTML = res.data.map((t) => {
        const active = t.status === 'issued' || t.status === 'partially_returned';
        return `<tr>
          <td><span class="mono">${esc(t.code)}</span><div class="cell-sub">${timeAgo(t.issued_at)}</div></td>
          <td><div class="cell-main">${esc(t.student_name)}</div><div class="cell-sub">${esc(t.student_reg_no)}</div></td>
          <td><div class="cell-main">${esc(t.component_name)}</div><div class="cell-sub">${esc(t.component_category)}</div></td>
          <td><strong>${fmtNum(t.quantity)}</strong><div class="cell-sub">ret ${fmtNum(t.quantity_returned)} · lost ${fmtNum(t.quantity_lost)}</div></td>
          <td>${statusBadge(t.status, t.is_overdue)}</td>
          <td class="nowrap"><span class="${t.is_overdue ? 'text-danger' : ''}">${fmtDate(t.due_at)}</span></td>
          <td><div class="row-actions">
            <button class="icon-btn" data-act="view" data-id="${esc(t.id)}" title="View">${icon('eye')}</button>
            ${canManage() && active ? `<button class="icon-btn" data-act="return" data-id="${esc(t.id)}" title="Return">${icon('undo')}</button>
            <button class="icon-btn danger" data-act="lost" data-id="${esc(t.id)}" title="Mark lost">${icon('alert')}</button>` : ''}
          </div></td>
        </tr>`;
      }).join('');
    }
    renderPager(document.getElementById('tx-pager'), res.pagination, (p) => { tx.page = p; loadTransactions(); });
    window.__txCache = res.data;
  }

  function onTransactionAction(e) {
    const btn = e.target.closest('button[data-act]');
    if (!btn) return;
    const t = (window.__txCache || []).find((x) => x.id === btn.dataset.id);
    if (!t) return;
    if (btn.dataset.act === 'view') return openTransactionDetail(t.id);
    if (!canManage()) return;
    if (btn.dataset.act === 'return') return openReturnForm(t);
    if (btn.dataset.act === 'lost') return openLostForm(t);
  }

  async function openIssueForm() {
    let students = [];
    let components = [];
    try {
      const [s, c] = await Promise.all([
        Api.get('/api/students?pageSize=100&active=true'),
        Api.get('/api/components?pageSize=100&active=true&sort=name&order=asc'),
      ]);
      students = s.data;
      components = c.data;
    } catch (err) { return handleErr(err); }

    if (!students.length || !components.length) {
      return toast('error', 'Cannot issue yet', 'Add at least one active student and one active component first.');
    }
    const defaultDue = fmtLocalInput(Date.now() + 7 * 86400000);
    const m = modal({
      title: 'Issue component',
      subtitle: 'Record a new loan against a student',
      wide: true,
      body: `<form id="issue-form" class="form-grid">
        <label class="field full"><span>Student *</span><select name="studentId" required>
          <option value="">Select a student…</option>
          ${students.map((s) => `<option value="${esc(s.id)}">${esc(s.name)} (${esc(s.reg_no)})</option>`).join('')}
        </select></label>
        <label class="field full"><span>Component *</span><select name="componentId" required>
          <option value="">Select a component…</option>
          ${components.map((c) => `<option value="${esc(c.id)}">${esc(c.name)} — ${fmtNum(c.available_quantity)} available</option>`).join('')}
        </select></label>
        <label class="field"><span>Quantity *</span><input name="quantity" type="number" min="1" value="1" required /></label>
        <label class="field"><span>Due date *</span><input name="dueAt" type="datetime-local" required value="${defaultDue}" /></label>
        <label class="field full"><span>Notes</span><textarea name="notes" placeholder="Optional"></textarea></label>
        <div class="full form-error" id="issue-err" hidden></div>
      </form>`,
      footer: `<button class="btn btn-ghost" data-act="cancel">Cancel</button><button class="btn btn-primary" id="issue-save">Issue component</button>`,
    });
    m.el.querySelector('[data-act="cancel"]').addEventListener('click', m.close);
    m.el.querySelector('#issue-save').addEventListener('click', async () => {
      const f = m.el.querySelector('#issue-form');
      if (!f.reportValidity()) return;
      const fd = new FormData(f);
      try {
        const res = await Api.post('/api/transactions/issue', {
          studentId: fd.get('studentId'),
          componentId: fd.get('componentId'),
          quantity: Number(fd.get('quantity')),
          dueAt: new Date(fd.get('dueAt')).toISOString(),
          notes: fd.get('notes').trim() || null,
        });
        m.close();
        toast('success', 'Component issued', res.transaction.code);
        loadTransactions();
        refreshOverdueBadge();
      } catch (err) {
        const box = m.el.querySelector('#issue-err');
        box.textContent = errMsg(err); box.hidden = false;
      }
    });
  }

  function openReturnForm(t) {
    const remaining = t.quantity - t.quantity_returned - t.quantity_lost;
    const m = modal({
      title: 'Return component',
      subtitle: `${t.code} · ${t.component_name}`,
      body: `<form id="return-form" class="form-grid">
        <label class="field"><span>Quantity to return *</span><input name="quantity" type="number" min="1" max="${remaining}" value="${remaining}" required /></label>
        <label class="field"><span>Condition</span><select name="condition">
          <option value="good">Good</option><option value="fair">Fair</option><option value="damaged">Damaged (write off)</option>
        </select></label>
        <label class="field full"><span>Notes</span><textarea name="notes" placeholder="Optional"></textarea></label>
        <div class="full form-hint">Outstanding: ${remaining} of ${t.quantity} unit(s). Damaged units are removed from stock.</div>
        <div class="full form-error" id="return-err" hidden></div>
      </form>`,
      footer: `<button class="btn btn-ghost" data-act="cancel">Cancel</button><button class="btn btn-success" id="return-save">Record return</button>`,
    });
    m.el.querySelector('[data-act="cancel"]').addEventListener('click', m.close);
    m.el.querySelector('#return-save').addEventListener('click', async () => {
      const f = m.el.querySelector('#return-form');
      if (!f.reportValidity()) return;
      const fd = new FormData(f);
      try {
        await Api.post(`/api/transactions/${t.id}/return`, {
          quantity: Number(fd.get('quantity')),
          condition: fd.get('condition'),
          notes: fd.get('notes').trim() || null,
        });
        m.close();
        toast('success', 'Return recorded', t.code);
        loadTransactions();
        refreshOverdueBadge();
      } catch (err) {
        const box = m.el.querySelector('#return-err');
        box.textContent = errMsg(err); box.hidden = false;
      }
    });
  }

  function openLostForm(t) {
    const remaining = t.quantity - t.quantity_returned - t.quantity_lost;
    const m = modal({
      title: 'Mark units lost',
      subtitle: `${t.code} · ${t.component_name}`,
      body: `<form id="lost-form" class="form-grid">
        <label class="field"><span>Quantity lost *</span><input name="quantity" type="number" min="1" max="${remaining}" value="${remaining}" required /></label>
        <label class="field full"><span>Notes</span><textarea name="notes" placeholder="Explain how the units were lost"></textarea></label>
        <div class="full form-hint">Lost units are written off and reduce total inventory. Outstanding: ${remaining}.</div>
        <div class="full form-error" id="lost-err" hidden></div>
      </form>`,
      footer: `<button class="btn btn-ghost" data-act="cancel">Cancel</button><button class="btn btn-danger" id="lost-save">Mark lost</button>`,
    });
    m.el.querySelector('[data-act="cancel"]').addEventListener('click', m.close);
    m.el.querySelector('#lost-save').addEventListener('click', async () => {
      const f = m.el.querySelector('#lost-form');
      if (!f.reportValidity()) return;
      const fd = new FormData(f);
      try {
        await Api.post(`/api/transactions/${t.id}/lost`, {
          quantity: Number(fd.get('quantity')),
          notes: fd.get('notes').trim() || null,
        });
        m.close();
        toast('success', 'Units marked lost', t.code);
        loadTransactions();
        refreshOverdueBadge();
      } catch (err) {
        const box = m.el.querySelector('#lost-err');
        box.textContent = errMsg(err); box.hidden = false;
      }
    });
  }

  async function openTransactionDetail(id) {
    try {
      const { transaction: t, events } = await Api.get(`/api/transactions/${id}`);
      const eventLabel = { issued: 'Issued', returned: 'Returned', lost: 'Marked lost', adjusted: 'Adjusted' };
      modal({
        title: t.code,
        subtitle: `${t.student_name} · ${t.component_name}`,
        wide: true,
        body: `
          <div class="detail-grid" style="margin-bottom:20px">
            <div class="detail-item"><label>Status</label><div>${statusBadge(t.status, t.is_overdue)}</div></div>
            <div class="detail-item"><label>Quantity</label><div>${fmtNum(t.quantity)} units</div></div>
            <div class="detail-item"><label>Returned</label><div>${fmtNum(t.quantity_returned)}</div></div>
            <div class="detail-item"><label>Lost</label><div>${fmtNum(t.quantity_lost)}</div></div>
            <div class="detail-item"><label>Issued at</label><div>${fmtDateTime(t.issued_at)}</div></div>
            <div class="detail-item"><label>Due at</label><div class="${t.is_overdue ? 'text-danger' : ''}">${fmtDateTime(t.due_at)}</div></div>
            <div class="detail-item"><label>Returned at</label><div>${fmtDateTime(t.returned_at)}</div></div>
            <div class="detail-item"><label>Issued by</label><div>${esc(t.issued_by_name || t.issued_by_username || '—')}</div></div>
            <div class="detail-item"><label>Student</label><div>${esc(t.student_name)} (${esc(t.student_reg_no)})</div></div>
            <div class="detail-item"><label>Component</label><div>${esc(t.component_name)} · <span class="qr-code">${esc(t.component_qr)}</span></div></div>
            ${t.notes ? `<div class="detail-item" style="grid-column:1/-1"><label>Notes</label><div>${esc(t.notes)}</div></div>` : ''}
          </div>
          <h4 style="margin-bottom:12px;font-size:.9rem">Event timeline</h4>
          <div class="timeline">${events.map((ev) => `
            <div class="timeline-item ${esc(ev.type)}">
              <strong>${esc(eventLabel[ev.type] || ev.type)}${ev.quantity ? ` · ${fmtNum(ev.quantity)} unit(s)` : ''}${ev.condition ? ` · ${esc(ev.condition)}` : ''}</strong>
              <span>${fmtDateTime(ev.created_at)} · ${esc(ev.actor_name || ev.actor_username || 'system')}${ev.notes ? ` · ${esc(ev.notes)}` : ''}</span>
            </div>`).join('')}</div>`,
        footer: '<button class="btn btn-ghost" data-act="close">Close</button>',
      });
    } catch (err) { handleErr(err); }
  }

  /* ============================================================
     Users (admin)
     ============================================================ */
  const usr = { search: '', role: '', page: 1, pageSize: 12 };

  async function viewUsers() {
    if (!isAdmin()) return;
    const v = viewEl();
    v.innerHTML = `
      <div class="toolbar">
        <div class="search-box">${icon('search')}<input id="usr-search" placeholder="Search username, name, email…" value="${esc(usr.search)}" /></div>
        <select id="usr-role">
          <option value="">All roles</option>
          ${['admin', 'staff', 'student'].map((r) => `<option value="${r}" ${usr.role === r ? 'selected' : ''}>${r}</option>`).join('')}
        </select>
        <div class="spacer"></div>
        <button class="btn btn-primary btn-sm" id="usr-add">${icon('plus')}Add user</button>
      </div>
      <div class="table-wrap"><table>
        <thead><tr><th>User</th><th>Email</th><th>Role</th><th>Status</th><th>Last login</th><th class="right">Actions</th></tr></thead>
        <tbody id="usr-body"><tr><td colspan="6"><div class="skeleton sk-line"></div></td></tr></tbody>
      </table></div>
      <div class="pagination" id="usr-pager"></div>`;

    const search = document.getElementById('usr-search');
    search.addEventListener('input', debounce(() => { usr.search = search.value.trim(); usr.page = 1; loadUsers(); }, 300));
    document.getElementById('usr-role').addEventListener('change', (e) => { usr.role = e.target.value; usr.page = 1; loadUsers(); });
    document.getElementById('usr-add').addEventListener('click', () => openUserForm());
    document.getElementById('usr-body').addEventListener('click', onUserAction);
    loadUsers();
  }

  async function loadUsers() {
    const body = document.getElementById('usr-body');
    if (!body) return;
    const params = new URLSearchParams({ page: usr.page, pageSize: usr.pageSize });
    if (usr.search) params.set('search', usr.search);
    if (usr.role) params.set('role', usr.role);
    const res = await Api.get(`/api/users?${params}`);
    if (!document.getElementById('usr-body')) return;
    if (!res.data.length) {
      body.innerHTML = `<tr><td colspan="6">${emptyState('users', 'No users found', 'Add a user to get started.')}</td></tr>`;
    } else {
      body.innerHTML = res.data.map((u) => `
        <tr>
          <td><div class="cell-main">${esc(u.full_name)}</div><div class="cell-sub">@${esc(u.username)}</div></td>
          <td><span class="cell-sub">${esc(u.email)}</span></td>
          <td>${roleBadge(u.role)}</td>
          <td>${activeBadge(u.is_active)}</td>
          <td class="nowrap"><span class="cell-sub">${u.last_login_at ? fmtDateTime(u.last_login_at) : 'Never'}</span></td>
          <td><div class="row-actions">
            <button class="icon-btn" data-act="edit" data-id="${esc(u.id)}" title="Edit">${icon('edit')}</button>
            ${u.id !== state.user.id ? `<button class="icon-btn danger" data-act="delete" data-id="${esc(u.id)}" title="Deactivate">${icon('trash')}</button>` : ''}
          </div></td>
        </tr>`).join('');
    }
    renderPager(document.getElementById('usr-pager'), res.pagination, (p) => { usr.page = p; loadUsers(); });
    window.__usrCache = res.data;
  }

  function onUserAction(e) {
    const btn = e.target.closest('button[data-act]');
    if (!btn) return;
    const u = (window.__usrCache || []).find((x) => x.id === btn.dataset.id);
    if (!u) return;
    if (btn.dataset.act === 'edit') return openUserForm(u);
    if (btn.dataset.act === 'delete') return deactivateUser(u);
  }

  function openUserForm(user) {
    const isEdit = Boolean(user);
    const u = user || {};
    const m = modal({
      title: isEdit ? 'Edit user' : 'New user',
      subtitle: isEdit ? `@${u.username}` : 'Create an account with a role',
      body: `<form id="usr-form" class="form-grid">
        ${isEdit ? '' : `<label class="field"><span>Username *</span><input name="username" required value="" placeholder="jane.doe" /></label>`}
        <label class="field"><span>Full name *</span><input name="fullName" required value="${esc(u.full_name || '')}" /></label>
        <label class="field"><span>Email *</span><input name="email" type="email" required value="${esc(u.email || '')}" /></label>
        <label class="field"><span>Role</span><select name="role">
          ${['admin', 'staff', 'student'].map((r) => `<option value="${r}" ${u.role === r ? 'selected' : ''}>${r}</option>`).join('')}
        </select></label>
        <label class="field"><span>${isEdit ? 'New password (optional)' : 'Password *'}</span><input name="password" type="password" ${isEdit ? '' : 'required'} placeholder="Min 8 chars, letter + number" autocomplete="new-password" /></label>
        ${isEdit ? `<label class="field"><span>Status</span><select name="isActive">
          <option value="true" ${u.is_active ? 'selected' : ''}>Active</option>
          <option value="false" ${!u.is_active ? 'selected' : ''}>Inactive</option>
        </select></label>` : ''}
        <div class="full form-error" id="usr-err" hidden></div>
      </form>`,
      footer: `<button class="btn btn-ghost" data-act="cancel">Cancel</button><button class="btn btn-primary" id="usr-save">${isEdit ? 'Save changes' : 'Create user'}</button>`,
    });
    m.el.querySelector('[data-act="cancel"]').addEventListener('click', m.close);
    m.el.querySelector('#usr-save').addEventListener('click', async () => {
      const f = m.el.querySelector('#usr-form');
      if (!f.reportValidity()) return;
      const fd = new FormData(f);
      try {
        if (isEdit) {
          const payload = { fullName: fd.get('fullName').trim(), email: fd.get('email').trim(), role: fd.get('role'), isActive: fd.get('isActive') === 'true' };
          if (fd.get('password')) payload.password = fd.get('password');
          await Api.patch(`/api/users/${u.id}`, payload);
        } else {
          await Api.post('/api/users', {
            username: fd.get('username').trim(),
            fullName: fd.get('fullName').trim(),
            email: fd.get('email').trim(),
            role: fd.get('role'),
            password: fd.get('password'),
          });
        }
        m.close();
        toast('success', isEdit ? 'User updated' : 'User created', fd.get('fullName').trim());
        loadUsers();
      } catch (err) {
        const box = m.el.querySelector('#usr-err');
        box.textContent = errMsg(err); box.hidden = false;
      }
    });
  }

  async function deactivateUser(u) {
    const ok = await confirmDialog({
      title: 'Deactivate user?',
      message: `${u.full_name} (@${u.username}) will lose access immediately. The last active administrator cannot be deactivated.`,
      confirmText: 'Deactivate', danger: true,
    });
    if (!ok) return;
    try {
      await Api.del(`/api/users/${u.id}`);
      toast('success', 'User deactivated', u.username);
      loadUsers();
    } catch (err) { handleErr(err); }
  }

  /* ============================================================
     Audit log (admin)
     ============================================================ */
  const aud = { search: '', action: '', page: 1, pageSize: 20 };

  async function viewAudit() {
    if (!isAdmin()) return;
    const v = viewEl();
    let actions = [];
    try { actions = (await Api.get('/api/audit/actions')).actions; } catch { /* ignore */ }
    v.innerHTML = `
      <div class="toolbar">
        <div class="search-box">${icon('search')}<input id="aud-search" placeholder="Search actor, action, entity…" value="${esc(aud.search)}" /></div>
        <select id="aud-action">
          <option value="">All actions</option>
          ${actions.map((a) => `<option value="${esc(a.action)}" ${aud.action === a.action ? 'selected' : ''}>${esc(a.action)} (${a.count})</option>`).join('')}
        </select>
        <div class="spacer"></div>
        <span class="hint text-muted">Read-only immutable trail</span>
      </div>
      <div class="table-wrap"><table>
        <thead><tr><th>Time</th><th>Actor</th><th>Action</th><th>Entity</th><th class="right">Details</th></tr></thead>
        <tbody id="aud-body"><tr><td colspan="5"><div class="skeleton sk-line"></div></td></tr></tbody>
      </table></div>
      <div class="pagination" id="aud-pager"></div>`;

    const search = document.getElementById('aud-search');
    search.addEventListener('input', debounce(() => { aud.search = search.value.trim(); aud.page = 1; loadAudit(); }, 300));
    document.getElementById('aud-action').addEventListener('change', (e) => { aud.action = e.target.value; aud.page = 1; loadAudit(); });
    document.getElementById('aud-body').addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-id]');
      if (!btn) return;
      const row = (window.__audCache || []).find((x) => x.id === btn.dataset.id);
      if (row) openAuditDetail(row);
    });
    loadAudit();
  }

  async function loadAudit() {
    const body = document.getElementById('aud-body');
    if (!body) return;
    const params = new URLSearchParams({ page: aud.page, pageSize: aud.pageSize });
    if (aud.search) params.set('search', aud.search);
    if (aud.action) params.set('action', aud.action);
    const res = await Api.get(`/api/audit?${params}`);
    if (!document.getElementById('aud-body')) return;
    if (!res.data.length) {
      body.innerHTML = `<tr><td colspan="5">${emptyState('history', 'No audit entries', 'Actions will appear here as the system is used.')}</td></tr>`;
    } else {
      body.innerHTML = res.data.map((r) => `
        <tr>
          <td class="nowrap"><span class="cell-sub">${fmtDateTime(r.created_at)}</span></td>
          <td><div class="cell-main">${esc(r.actor_username || 'system')}</div><div class="cell-sub">${esc(r.ip || '—')}</div></td>
          <td><span class="mono" style="color:#7dd3fc">${esc(r.action)}</span></td>
          <td><span class="cell-sub">${esc(r.entity_type)}${r.entity_id ? ` · ${esc(r.entity_id.slice(0, 8))}` : ''}</span></td>
          <td class="right"><button class="btn btn-ghost btn-sm" data-id="${esc(r.id)}">${icon('eye')} View</button></td>
        </tr>`).join('');
    }
    renderPager(document.getElementById('aud-pager'), res.pagination, (p) => { aud.page = p; loadAudit(); });
    window.__audCache = res.data;
  }

  function openAuditDetail(r) {
    const json = (v) => v === null || v === undefined ? '<span class="text-muted">—</span>' : `<pre class="mono" style="white-space:pre-wrap;margin:0;font-size:.74rem;line-height:1.5">${esc(JSON.stringify(v, null, 2))}</pre>`;
    modal({
      title: r.action,
      subtitle: `${fmtDateTime(r.created_at)} · ${r.actor_username || 'system'}`,
      wide: true,
      body: `<div class="detail-grid" style="margin-bottom:16px">
          <div class="detail-item"><label>Entity</label><div>${esc(r.entity_type)}</div></div>
          <div class="detail-item"><label>Entity ID</label><div class="mono">${esc(r.entity_id || '—')}</div></div>
          <div class="detail-item"><label>IP address</label><div>${esc(r.ip || '—')}</div></div>
          <div class="detail-item"><label>User agent</label><div style="word-break:break-all;font-size:.76rem">${esc(r.user_agent || '—')}</div></div>
        </div>
        <div class="grid cols-2-even">
          <div><h4 style="margin-bottom:8px;font-size:.82rem" class="text-muted">Before</h4><div class="card" style="padding:12px">${json(r.before)}</div></div>
          <div><h4 style="margin-bottom:8px;font-size:.82rem" class="text-muted">After</h4><div class="card" style="padding:12px">${json(r.after)}</div></div>
        </div>`,
      footer: '<button class="btn btn-ghost" data-act="close">Close</button>',
    });
  }

  /* ============================================================
     Boot
     ============================================================ */
  function boot() {
    document.getElementById('year').textContent = new Date().getFullYear();
    bindLogin();
    bindShell();
    window.addEventListener('hashchange', () => route());
    if (Api.getAccessToken()) {
      Api.me()
        .then((user) => onLogin(user))
        .catch(() => { Api.clearSession(); showLogin(); });
    } else {
      showLogin();
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
