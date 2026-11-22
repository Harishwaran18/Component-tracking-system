'use strict';

const nowIso = () => new Date().toISOString();

const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

function parsePagination(query, { defaultSize = 20, maxSize = 100 } = {}) {
  const page = Math.max(1, Number.parseInt(query.page, 10) || 1);
  const pageSize = Math.min(maxSize, Math.max(1, Number.parseInt(query.pageSize, 10) || defaultSize));
  return { page, pageSize, offset: (page - 1) * pageSize };
}

function paginated(data, total, { page, pageSize }) {
  return {
    data,
    pagination: {
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
      hasNext: page * pageSize < total,
      hasPrev: page > 1,
    },
  };
}

const sanitizeUser = (u) => {
  if (!u) return null;
  const { password_hash, ...rest } = u;
  return {
    ...rest,
    is_active: Boolean(rest.is_active),
  };
};

const boolToInt = (v) => (v ? 1 : 0);

module.exports = { nowIso, asyncHandler, parsePagination, paginated, sanitizeUser, boolToInt };
