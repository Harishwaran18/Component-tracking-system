(function () {
  'use strict';
  const esc = (v) => String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  fetch('/api/openapi.json')
    .then((r) => r.json())
    .then((spec) => {
      const groups = {};
      Object.entries(spec.paths || {}).forEach(([path, methods]) => {
        Object.entries(methods).forEach(([method, op]) => {
          const tag = (op.tags && op.tags[0]) || 'Other';
          (groups[tag] = groups[tag] || []).push({ path, method, op });
        });
      });
      const order = ['Auth', 'Dashboard', 'Components', 'Students', 'Transactions', 'Users', 'Audit', 'Other'];
      const sections = Object.keys(groups).sort((a, b) => order.indexOf(a) - order.indexOf(b)).map((tag) => {
        const items = groups[tag].map(({ path, method, op }) => `
          <div class="endpoint">
            <span class="method ${esc(method)}">${esc(method.toUpperCase())}</span>
            <div><div class="path">${esc(path)}</div><div class="summary">${esc(op.summary || '')}</div></div>
            ${op.security ? '<span class="auth">Bearer auth</span>' : '<span class="auth">Public</span>'}
          </div>`).join('');
        return `<section class="docs-section"><h2>${esc(tag)} <span class="count">${groups[tag].length}</span></h2>${items}</section>`;
      }).join('');
      document.getElementById('docs').innerHTML = sections || '<p>No endpoints found.</p>';
    })
    .catch(() => {
      document.getElementById('docs').innerHTML = '<p class="text-danger">Could not load the API specification.</p>';
    });
})();
