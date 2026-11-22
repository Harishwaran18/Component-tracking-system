/* Circuit API client — token handling, refresh rotation, typed errors */
(function () {
  'use strict';

  const KEYS = { access: 'circuit.access', refresh: 'circuit.refresh', user: 'circuit.user' };

  class ApiError extends Error {
    constructor(message, status, code, details) {
      super(message);
      this.name = 'ApiError';
      this.status = status;
      this.code = code;
      this.details = details;
    }
  }

  let refreshing = null;

  const store = {
    get access() { return localStorage.getItem(KEYS.access); },
    get refresh() { return localStorage.getItem(KEYS.refresh); },
    get user() {
      try { return JSON.parse(localStorage.getItem(KEYS.user) || 'null'); } catch { return null; }
    },
    set(access, refresh, user) {
      if (access) localStorage.setItem(KEYS.access, access);
      if (refresh) localStorage.setItem(KEYS.refresh, refresh);
      if (user) localStorage.setItem(KEYS.user, JSON.stringify(user));
    },
    clear() {
      localStorage.removeItem(KEYS.access);
      localStorage.removeItem(KEYS.refresh);
      localStorage.removeItem(KEYS.user);
    },
  };

  async function parse(res) {
    const text = await res.text();
    if (!text) return null;
    try { return JSON.parse(text); } catch { return text; }
  }

  async function rawRequest(path, { method = 'GET', body, headers = {}, auth = true } = {}) {
    const opts = { method, headers: { ...headers } };
    if (body !== undefined) {
      opts.headers['Content-Type'] = 'application/json';
      opts.body = JSON.stringify(body);
    }
    if (auth && store.access) opts.headers.Authorization = `Bearer ${store.access}`;
    const res = await fetch(path, opts);
    const data = await parse(res);
    if (!res.ok) {
      const err = data && data.error ? data.error : {};
      throw new ApiError(err.message || `Request failed (${res.status})`, res.status, err.code, err.details);
    }
    return data;
  }

  async function tryRefresh() {
    if (!store.refresh) throw new ApiError('Session expired', 401, 'NO_REFRESH_TOKEN');
    if (!refreshing) {
      refreshing = (async () => {
        const data = await rawRequest('/api/auth/refresh', {
          method: 'POST',
          body: { refreshToken: store.refresh },
          auth: false,
        });
        store.set(data.accessToken, data.refreshToken, data.user);
        return data;
      })().finally(() => { refreshing = null; });
    }
    return refreshing;
  }

  async function request(path, options = {}) {
    try {
      return await rawRequest(path, options);
    } catch (err) {
      const canRetry =
        err instanceof ApiError &&
        err.status === 401 &&
        options.auth !== false &&
        (err.code === 'TOKEN_EXPIRED' || err.code === 'INVALID_TOKEN') &&
        store.refresh;
      if (!canRetry) throw err;
      try {
        await tryRefresh();
      } catch (refreshErr) {
        store.clear();
        window.dispatchEvent(new CustomEvent('auth:logout'));
        throw refreshErr;
      }
      return rawRequest(path, options);
    }
  }

  async function download(path, filename) {
    const res = await fetch(path, { headers: store.access ? { Authorization: `Bearer ${store.access}` } : {} });
    if (!res.ok) throw new ApiError('Download failed', res.status);
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  window.Api = {
    ApiError,
    store,
    get: (p) => request(p),
    post: (p, body) => request(p, { method: 'POST', body }),
    patch: (p, body) => request(p, { method: 'PATCH', body }),
    del: (p) => request(p, { method: 'DELETE' }),
    download,
    getUser: () => store.user,
    getAccessToken: () => store.access,
    clearSession: () => store.clear(),
    async login(username, password) {
      const data = await request('/api/auth/login', { method: 'POST', body: { username, password }, auth: false });
      store.set(data.accessToken, data.refreshToken, data.user);
      return data;
    },
    async logout() {
      const refreshToken = store.refresh;
      try {
        await request('/api/auth/logout', { method: 'POST', body: { refreshToken }, auth: false });
      } catch { /* best effort */ }
      store.clear();
    },
    async me() {
      const data = await request('/api/auth/me');
      store.set(null, null, data.user);
      return data.user;
    },
  };
})();
