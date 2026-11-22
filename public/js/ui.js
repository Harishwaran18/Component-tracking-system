/* Circuit UI helpers — escaping, formatting, toasts, modals, charts, pagination */
(function () {
  'use strict';

  const ICONS = {
    eye: 'M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5C21.27 7.61 17 4.5 12 4.5zm0 12.5a5 5 0 1 1 0-10 5 5 0 0 1 0 10zm0-8a3 3 0 1 0 0 6 3 3 0 0 0 0-6z',
    edit: 'M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z',
    trash: 'M6 19a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z',
    qr: 'M3 3h8v8H3V3zm2 2v4h4V5H5zm8-2h8v8h-8V3zm2 2v4h4V5h-4zM3 13h8v8H3v-8zm2 2v4h4v-4H5zm13-2h3v3h-3v-3zm-5 0h3v3h-3v-3zm2 3h3v3h-3v-3zm-2 2h3v3h-3v-3zm5 1h3v3h-3v-3z',
    plus: 'M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z',
    download: 'M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z',
    search: 'M15.5 14h-.79l-.28-.27A6.47 6.47 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z',
    refresh: 'M17.65 6.35A8 8 0 1 0 19.73 14h-2.08A6 6 0 1 1 12 6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z',
    box: 'M20 8h-3V4H7v4H4v12h16V8zM9 6h6v2H9V6zm9 12H6v-8h2v2h2v-2h4v2h2v-2h2v8z',
    users: 'M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5s-3 1.34-3 3 1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z',
    check: 'M9 16.17 4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z',
    x: 'M19 6.41 17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z',
    undo: 'M12.5 8c-2.65 0-5.05.99-6.9 2.6L2 7v9h9l-3.62-3.62A7.98 7.98 0 0 1 12.5 10c3.54 0 6.55 2.31 7.6 5.5l2.37-.78C21.08 10.03 17.15 8 12.5 8z',
    alert: 'M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z',
    wrench: 'M22.7 19l-9.1-9.1c.9-2.3.4-5-1.5-6.9-2-2-5-2.4-7.4-1.3L9 6 6 9 1.6 4.7C.4 7.1.9 10.1 2.9 12.1c1.9 1.9 4.6 2.4 6.9 1.5l9.1 9.1c.4.4 1 .4 1.4 0l2.3-2.3c.5-.4.5-1.1.1-1.4z',
    history: 'M13 3a9 9 0 0 0-9 9H1l3.89 3.89.07.14L9 12H6a7 7 0 1 1 7 7c-1.93 0-3.68-.79-4.94-2.06l-1.42 1.42A8.95 8.95 0 0 0 13 21a9 9 0 0 0 0-18zm-1 5v5l4.28 2.54.72-1.21-3.5-2.08V8H12z',
    print: 'M19 8H5c-1.66 0-3 1.34-3 3v6h4v4h12v-4h4v-6c0-1.66-1.34-3-3-3zm-3 11H8v-5h8v5zm3-7a1 1 0 1 1 0-2 1 1 0 0 1 0 2zm-1-9H6v4h12V3z',
    key: 'M12.65 10A6 6 0 1 0 7 16c.9 0 1.75-.2 2.5-.56V17l-2 2 2 2 2-2v-1h1.44c.36.75.56 1.6.56 2.5A6 6 0 1 0 12.65 10zM7 14a2 2 0 1 1 0-4 2 2 0 0 1 0 4z',
    power: 'M13 3h-2v10h2V3zm4.83 2.17-1.42 1.42A6.92 6.92 0 0 1 19 12a7 7 0 1 1-11.41-5.41L6.17 5.17A9 9 0 1 0 17.83 5.17z',
    arrowLeft: 'M15.41 7.41 14 6l-6 6 6 6 1.41-1.41L10.83 12z',
    arrowRight: 'M8.59 16.59 10 18l6-6-6-6-1.41 1.41L13.17 12z',
    external: 'M19 19H5V5h7V3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14c1.1 0 2-.9 2-2v-7h-2v7zM14 3v2h3.59l-9.83 9.83 1.41 1.41L19 6.41V10h2V3h-7z',
  };

  const icon = (name, cls = '') => `<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true"><path d="${ICONS[name] || ''}"/></svg>`;

  const esc = (v) => String(v === null || v === undefined ? '' : v)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

  const fmtDate = (iso) => {
    if (!iso) return '—';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '—';
    return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: '2-digit' });
  };
  const fmtDateTime = (iso) => {
    if (!iso) return '—';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '—';
    return d.toLocaleString(undefined, { year: 'numeric', month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit' });
  };
  const timeAgo = (iso) => {
    if (!iso) return '—';
    const diff = Date.now() - new Date(iso).getTime();
    if (Number.isNaN(diff)) return '—';
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    if (days < 30) return `${days}d ago`;
    return fmtDate(iso);
  };
  const fmtNum = (n) => Number(n || 0).toLocaleString();
  const fmtMoney = (n) => Number(n || 0).toLocaleString(undefined, { style: 'currency', currency: 'INR', maximumFractionDigits: 2 });

  const statusBadge = (status, overdue) => {
    if (overdue && (status === 'issued' || status === 'partially_returned')) {
      return '<span class="badge overdue">overdue</span>';
    }
    const label = String(status || '').replace(/_/g, ' ');
    return `<span class="badge ${esc(status)}">${esc(label)}</span>`;
  };
  const roleBadge = (role) => `<span class="badge role-${esc(role)}">${esc(role)}</span>`;
  const activeBadge = (active) => active
    ? '<span class="badge active">active</span>'
    : '<span class="badge inactive">inactive</span>';

  /* ---------- Toasts ---------- */
  function toast(type, title, message) {
    const root = document.getElementById('toast-container');
    const el = document.createElement('div');
    el.className = `toast ${type}`;
    const glyph = type === 'success' ? '✓' : type === 'error' ? '!' : 'i';
    el.innerHTML = `<div class="toast-icon">${glyph}</div><div><strong>${esc(title)}</strong>${message ? `<p>${esc(message)}</p>` : ''}</div>`;
    root.appendChild(el);
    setTimeout(() => {
      el.classList.add('hide');
      setTimeout(() => el.remove(), 260);
    }, 4200);
  }

  /* ---------- Modal ---------- */
  function modal({ title, subtitle, body, footer = '', wide = false, onClose } = {}) {
    const root = document.getElementById('modal-root');
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal ${wide ? 'wide' : ''}" role="dialog" aria-modal="true">
        <div class="modal-head">
          <div><h3>${esc(title || '')}</h3>${subtitle ? `<p>${esc(subtitle)}</p>` : ''}</div>
          <button class="modal-close" type="button" aria-label="Close">✕</button>
        </div>
        <div class="modal-body">${body || ''}</div>
        ${footer ? `<div class="modal-foot">${footer}</div>` : ''}
      </div>`;
    root.appendChild(overlay);
    document.body.style.overflow = 'hidden';

    const close = () => {
      overlay.remove();
      document.body.style.overflow = '';
      document.removeEventListener('keydown', onKey);
      if (onClose) onClose();
    };
    const onKey = (e) => { if (e.key === 'Escape') close(); };
    overlay.querySelector('.modal-close').addEventListener('click', close);
    overlay.addEventListener('mousedown', (e) => { if (e.target === overlay) close(); });
    document.addEventListener('keydown', onKey);

    return { overlay, el: overlay.querySelector('.modal'), close };
  }

  function confirmDialog({ title, message, confirmText = 'Confirm', danger = false }) {
    return new Promise((resolve) => {
      const m = modal({
        title,
        body: `<p class="text-muted" style="line-height:1.6">${esc(message)}</p>`,
        footer: `
          <button class="btn btn-ghost" data-act="cancel">Cancel</button>
          <button class="btn ${danger ? 'btn-danger' : 'btn-primary'}" data-act="ok">${esc(confirmText)}</button>`,
        onClose: () => resolve(false),
      });
      m.el.querySelector('[data-act="cancel"]').addEventListener('click', () => { resolve(false); m.close(); });
      m.el.querySelector('[data-act="ok"]').addEventListener('click', () => { resolve(true); m.close(); });
    });
  }

  /* ---------- Charts ---------- */
  function lineChart(series, { height = 210 } = {}) {
    if (!series || !series.length) return '<div class="empty"><p>No activity yet</p></div>';
    const W = 820, H = height, padL = 34, padR = 12, padT = 14, padB = 26;
    const max = Math.max(1, ...series.map((d) => Math.max(d.issued, d.returned)));
    const stepX = (W - padL - padR) / Math.max(1, series.length - 1);
    const y = (v) => padT + (H - padT - padB) * (1 - v / max);
    const x = (i) => padL + i * stepX;
    const line = (key) => series.map((d, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(d[key]).toFixed(1)}`).join(' ');
    const area = (key) => `${line(key)} L${x(series.length - 1).toFixed(1)},${H - padB} L${padL},${H - padB} Z`;
    const gid = `g${Math.random().toString(36).slice(2, 8)}`;
    const grid = [0, 0.25, 0.5, 0.75, 1].map((f) => {
      const gy = padT + (H - padT - padB) * f;
      return `<line x1="${padL}" y1="${gy}" x2="${W - padR}" y2="${gy}" stroke="rgba(129,148,180,.14)" stroke-dasharray="3 4"/>
        <text x="${padL - 7}" y="${gy + 3}" fill="#6f82a3" font-size="9" text-anchor="end">${Math.round(max * (1 - f))}</text>`;
    }).join('');
    const labelEvery = Math.ceil(series.length / 7);
    const labels = series.map((d, i) => {
      if (i % labelEvery !== 0 && i !== series.length - 1) return '';
      return `<text x="${x(i)}" y="${H - 8}" fill="#6f82a3" font-size="9" text-anchor="middle">${esc(d.date.slice(5))}</text>`;
    }).join('');
    return `
      <svg viewBox="0 0 ${W} ${H}" width="100%" height="${H}" preserveAspectRatio="none" role="img" aria-label="Activity chart">
        <defs>
          <linearGradient id="${gid}i" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="#22d3ee" stop-opacity=".30"/>
            <stop offset="100%" stop-color="#22d3ee" stop-opacity="0"/>
          </linearGradient>
          <linearGradient id="${gid}r" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="#a855f7" stop-opacity=".22"/>
            <stop offset="100%" stop-color="#a855f7" stop-opacity="0"/>
          </linearGradient>
        </defs>
        ${grid}
        <path d="${area('issued')}" fill="url(#${gid}i)"/>
        <path d="${area('returned')}" fill="url(#${gid}r)"/>
        <path d="${line('issued')}" fill="none" stroke="#22d3ee" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round"/>
        <path d="${line('returned')}" fill="none" stroke="#a855f7" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round"/>
        ${labels}
      </svg>`;
  }

  function barList(data, { labelKey, valueKey, suffix = '' } = {}) {
    if (!data || !data.length) return '<div class="empty"><p>No data</p></div>';
    const max = Math.max(1, ...data.map((d) => Number(d[valueKey]) || 0));
    return `<div class="bars">${data.map((d) => {
      const v = Number(d[valueKey]) || 0;
      return `<div class="bar-row">
        <div class="bar-top"><span>${esc(d[labelKey])}</span><strong>${fmtNum(v)}${suffix}</strong></div>
        <div class="bar-track"><div class="bar-fill" style="width:${Math.max(3, (v / max) * 100).toFixed(1)}%"></div></div>
      </div>`;
    }).join('')}</div>`;
  }

  function emptyState(iconName, title, text) {
    return `<div class="empty">${icon(iconName)}<h4>${esc(title)}</h4><p>${esc(text || '')}</p></div>`;
  }

  /* ---------- Pagination ---------- */
  function renderPager(container, pagination, onGo) {
    if (!pagination) { container.innerHTML = ''; return; }
    const { page, totalPages, total, pageSize } = pagination;
    const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
    const to = Math.min(total, page * pageSize);
    const nums = [];
    const start = Math.max(1, page - 2);
    const end = Math.min(totalPages, start + 4);
    for (let i = start; i <= end; i += 1) nums.push(i);
    container.innerHTML = `
      <div class="info">Showing ${from}–${to} of ${fmtNum(total)}</div>
      <div class="pager">
        <button data-p="${page - 1}" ${page <= 1 ? 'disabled' : ''}>${icon('arrowLeft')}</button>
        ${nums.map((n) => `<button data-p="${n}" class="${n === page ? 'active' : ''}">${n}</button>`).join('')}
        <button data-p="${page + 1}" ${page >= totalPages ? 'disabled' : ''}>${icon('arrowRight')}</button>
      </div>`;
    container.querySelectorAll('button[data-p]').forEach((b) => {
      b.addEventListener('click', () => {
        const p = Number(b.dataset.p);
        if (p >= 1 && p <= totalPages && p !== page) onGo(p);
      });
    });
  }

  const debounce = (fn, wait = 320) => {
    let t;
    return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), wait); };
  };

  const stockMeter = (available, total, minStock) => {
    const pct = total > 0 ? Math.min(100, (available / total) * 100) : 0;
    const cls = available <= 0 ? 'empty' : available <= minStock ? 'low' : '';
    return `<div class="stock">
      <div class="stock-top"><strong>${fmtNum(available)}</strong><span class="text-muted">/ ${fmtNum(total)}</span></div>
      <div class="meter ${cls}"><span style="width:${pct.toFixed(1)}%"></span></div>
    </div>`;
  };

  window.UI = {
    icon, esc, fmtDate, fmtDateTime, timeAgo, fmtNum, fmtMoney,
    statusBadge, roleBadge, activeBadge, toast, modal, confirmDialog,
    lineChart, barList, emptyState, renderPager, debounce, stockMeter,
  };
})();
