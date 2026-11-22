'use strict';

const express = require('express');
const { v4: uuid } = require('uuid');
const { getDb } = require('../db');
const { AppError } = require('../utils/errors');
const { asyncHandler, nowIso, parsePagination, paginated, boolToInt } = require('../utils/http');
const { toCsv } = require('../utils/csv');
const { recordAudit } = require('../services/audit');
const qr = require('../services/qr');
const { authenticate, authorize } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const { createComponentSchema, updateComponentSchema, restockSchema } = require('../validation/schemas');

const router = express.Router();
router.use(authenticate);

const ACTIVE_STATUSES = "('issued','partially_returned')";
const SORTABLE = {
  name: 'name',
  category: 'category',
  total_quantity: 'total_quantity',
  available_quantity: 'available_quantity',
  min_stock: 'min_stock',
  created_at: 'created_at',
  updated_at: 'updated_at',
};

function getComponentOr404(id) {
  const c = getDb().prepare('SELECT * FROM components WHERE id = ?').get(id);
  if (!c) throw AppError.notFound('Component not found');
  return c;
}

const shape = (c) => ({
  ...c,
  is_active: Boolean(c.is_active),
  issued_quantity: c.total_quantity - c.available_quantity,
  low_stock: c.available_quantity <= c.min_stock,
});

function generateQrCode() {
  const db = getDb();
  for (let i = 0; i < 5; i += 1) {
    const code = `ECE-${uuid().replace(/-/g, '').slice(0, 10).toUpperCase()}`;
    if (!db.prepare('SELECT 1 FROM components WHERE qr_code = ?').get(code)) return code;
  }
  return `ECE-${Date.now()}`;
}

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const { page, pageSize, offset } = parsePagination(req.query);
    const { search, category, active, lowStock } = req.query;
    const where = [];
    const params = [];
    if (search) {
      where.push('(name LIKE ? OR qr_code LIKE ? OR description LIKE ? OR location LIKE ?)');
      const q = `%${search}%`;
      params.push(q, q, q, q);
    }
    if (category) {
      where.push('category = ?');
      params.push(category);
    }
    if (active !== undefined) {
      where.push('is_active = ?');
      params.push(boolToInt(active === 'true' || active === '1'));
    }
    if (lowStock === 'true' || lowStock === '1') where.push('available_quantity <= min_stock');

    const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const sortCol = SORTABLE[req.query.sort] || 'created_at';
    const order = String(req.query.order).toLowerCase() === 'asc' ? 'ASC' : 'DESC';
    const db = getDb();
    const total = db.prepare(`SELECT COUNT(*) AS c FROM components ${clause}`).get(...params).c;
    const rows = db
      .prepare(`SELECT * FROM components ${clause} ORDER BY ${sortCol} ${order} LIMIT ? OFFSET ?`)
      .all(...params, pageSize, offset);
    res.json(paginated(rows.map(shape), total, { page, pageSize }));
  })
);

router.get(
  '/categories',
  asyncHandler(async (_req, res) => {
    const rows = getDb()
      .prepare(
        `SELECT category, COUNT(*) AS count, COALESCE(SUM(available_quantity),0) AS available
         FROM components WHERE is_active = 1 GROUP BY category ORDER BY category COLLATE NOCASE`
      )
      .all();
    res.json({ categories: rows });
  })
);

router.get(
  '/export/csv',
  asyncHandler(async (_req, res) => {
    const rows = getDb().prepare('SELECT * FROM components ORDER BY name COLLATE NOCASE').all();
    const csv = toCsv(rows, [
      { label: 'QR Code', value: (r) => r.qr_code },
      { label: 'Name', value: (r) => r.name },
      { label: 'Category', value: (r) => r.category },
      { label: 'Location', value: (r) => r.location },
      { label: 'Unit', value: (r) => r.unit },
      { label: 'Total', value: (r) => r.total_quantity },
      { label: 'Available', value: (r) => r.available_quantity },
      { label: 'Min Stock', value: (r) => r.min_stock },
      { label: 'Unit Cost', value: (r) => r.unit_cost },
      { label: 'Condition', value: (r) => r.condition },
      { label: 'Active', value: (r) => r.is_active },
    ]);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="components.csv"');
    res.send(csv);
  })
);

router.get(
  '/by-qr/:code',
  asyncHandler(async (req, res) => {
    const c = getDb().prepare('SELECT * FROM components WHERE qr_code = ?').get(req.params.code);
    if (!c) throw AppError.notFound('No component matches this QR code');
    const activeLoans = getDb()
      .prepare(`SELECT COUNT(*) AS c FROM transactions WHERE component_id = ? AND status IN ${ACTIVE_STATUSES}`)
      .get(c.id).c;
    res.json({ component: shape(c), activeLoans });
  })
);

router.post(
  '/',
  authorize('admin', 'staff'),
  validate(createComponentSchema),
  asyncHandler(async (req, res) => {
    const db = getDb();
    const b = req.body;
    const total = b.totalQuantity;
    const available = b.availableQuantity === undefined ? total : b.availableQuantity;
    if (available > total) throw AppError.unprocessable('availableQuantity cannot exceed totalQuantity');

    const id = uuid();
    const qrCode = generateQrCode();
    db.prepare(
      `INSERT INTO components
        (id, qr_code, name, category, description, location, unit, total_quantity, available_quantity, min_stock, unit_cost, condition, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      id,
      qrCode,
      b.name,
      b.category,
      b.description ?? null,
      b.location ?? null,
      b.unit,
      total,
      available,
      b.minStock,
      b.unitCost,
      b.condition,
      nowIso(),
      nowIso()
    );
    const created = shape(getComponentOr404(id));
    recordAudit({ actor: req.user, action: 'component.created', entityType: 'component', entityId: id, after: created, req });
    res.status(201).json({ component: created });
  })
);

router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const c = shape(getComponentOr404(req.params.id));
    const activeLoans = getDb()
      .prepare(`SELECT COUNT(*) AS c FROM transactions WHERE component_id = ? AND status IN ${ACTIVE_STATUSES}`)
      .get(c.id).c;
    res.json({ component: c, activeLoans });
  })
);

router.patch(
  '/:id',
  authorize('admin', 'staff'),
  validate(updateComponentSchema),
  asyncHandler(async (req, res) => {
    const db = getDb();
    const component = getComponentOr404(req.params.id);
    const b = req.body;
    const updates = [];
    const params = [];

    const simple = {
      name: 'name',
      category: 'category',
      description: 'description',
      location: 'location',
      unit: 'unit',
      minStock: 'min_stock',
      unitCost: 'unit_cost',
      condition: 'condition',
    };
    for (const [key, column] of Object.entries(simple)) {
      if (b[key] !== undefined) {
        updates.push(`${column} = ?`);
        params.push(b[key]);
      }
    }
    if (b.isActive !== undefined) {
      updates.push('is_active = ?');
      params.push(boolToInt(b.isActive));
    }

    if (b.totalQuantity !== undefined && b.totalQuantity !== component.total_quantity) {
      const issued = component.total_quantity - component.available_quantity;
      if (b.totalQuantity < issued) {
        throw AppError.unprocessable(
          `Cannot reduce total below ${issued}; that many units are currently issued`,
          [{ path: 'totalQuantity', message: `Minimum allowed is ${issued}` }]
        );
      }
      updates.push('total_quantity = ?', 'available_quantity = ?');
      params.push(b.totalQuantity, b.totalQuantity - issued);
    }

    if (!updates.length) throw AppError.badRequest('No valid fields supplied');
    updates.push('updated_at = ?');
    params.push(nowIso());
    db.prepare(`UPDATE components SET ${updates.join(', ')} WHERE id = ?`).run(...params, component.id);
    const updated = shape(getComponentOr404(component.id));
    recordAudit({ actor: req.user, action: 'component.updated', entityType: 'component', entityId: component.id, before: component, after: updated, req });
    res.json({ component: updated });
  })
);

router.post(
  '/:id/restock',
  authorize('admin', 'staff'),
  validate(restockSchema),
  asyncHandler(async (req, res) => {
    const db = getDb();
    const component = getComponentOr404(req.params.id);
    const { quantity, unitCost } = req.body;
    const total = component.total_quantity + quantity;
    const available = component.available_quantity + quantity;
    const cost = unitCost === undefined ? component.unit_cost : unitCost;
    db.prepare(
      `UPDATE components SET total_quantity = ?, available_quantity = ?, unit_cost = ?, updated_at = ? WHERE id = ?`
    ).run(total, available, cost, nowIso(), component.id);
    const updated = shape(getComponentOr404(component.id));
    recordAudit({
      actor: req.user,
      action: 'component.restocked',
      entityType: 'component',
      entityId: component.id,
      before: { total_quantity: component.total_quantity, available_quantity: component.available_quantity },
      after: { total_quantity: total, available_quantity: available, added: quantity },
      req,
    });
    res.json({ component: updated });
  })
);

router.delete(
  '/:id',
  authorize('admin', 'staff'),
  asyncHandler(async (req, res) => {
    const db = getDb();
    const component = getComponentOr404(req.params.id);
    const active = db
      .prepare(`SELECT COUNT(*) AS c FROM transactions WHERE component_id = ? AND status IN ${ACTIVE_STATUSES}`)
      .get(component.id).c;
    if (active > 0) throw AppError.conflict('Cannot deactivate a component with active loans', 'ACTIVE_LOANS');
    db.prepare('UPDATE components SET is_active = 0, updated_at = ? WHERE id = ?').run(nowIso(), component.id);
    recordAudit({ actor: req.user, action: 'component.deactivated', entityType: 'component', entityId: component.id, before: component, req });
    res.status(204).send();
  })
);

router.get(
  '/:id/qr',
  asyncHandler(async (req, res) => {
    const component = getComponentOr404(req.params.id);
    const dataUrl = await qr.toDataUrl(component.qr_code, 360);
    res.json({
      component: { id: component.id, name: component.name, qrCode: component.qr_code },
      dataUrl,
    });
  })
);

router.get(
  '/:id/qr.png',
  asyncHandler(async (req, res) => {
    const component = getComponentOr404(req.params.id);
    const buffer = await qr.toBuffer(component.qr_code, 400);
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Content-Disposition', `inline; filename="${component.qr_code}.png"`);
    res.send(buffer);
  })
);

module.exports = router;
