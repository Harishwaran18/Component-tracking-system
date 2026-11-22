'use strict';

const express = require('express');
const { v4: uuid } = require('uuid');
const { getDb } = require('../db');
const { AppError } = require('../utils/errors');
const { asyncHandler, nowIso, parsePagination, paginated } = require('../utils/http');
const { toCsv } = require('../utils/csv');
const { recordAudit } = require('../services/audit');
const { authenticate, authorize } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const { issueSchema, returnSchema, lostSchema } = require('../validation/schemas');

const router = express.Router();
router.use(authenticate);

const ACTIVE_STATUSES = "('issued','partially_returned')";

const TX_SELECT = `
  SELECT t.*,
    s.reg_no AS student_reg_no, s.name AS student_name, s.dept AS student_dept,
    c.name AS component_name, c.category AS component_category, c.qr_code AS component_qr,
    u.username AS issued_by_username, u.full_name AS issued_by_name,
    CASE WHEN t.status IN ${ACTIVE_STATUSES} AND t.due_at < @now THEN 1 ELSE 0 END AS is_overdue
  FROM transactions t
  JOIN students s ON s.id = t.student_id
  JOIN components c ON c.id = t.component_id
  LEFT JOIN users u ON u.id = t.issued_by
`;

function getTxOr404(id) {
  const row = getDb().prepare(`${TX_SELECT} WHERE t.id = @id`).get({ id, now: nowIso() });
  if (!row) throw AppError.notFound('Transaction not found');
  return row;
}

function generateCode() {
  const db = getDb();
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  for (let i = 0; i < 6; i += 1) {
    const suffix = uuid().replace(/-/g, '').slice(0, 6).toUpperCase();
    const code = `TXN-${date}-${suffix}`;
    if (!db.prepare('SELECT 1 FROM transactions WHERE code = ?').get(code)) return code;
  }
  return `TXN-${Date.now()}`;
}

const deriveStatus = (returned, lost, quantity) => {
  const closed = returned + lost;
  if (closed >= quantity) return lost > 0 ? 'lost' : 'returned';
  if (closed > 0) return 'partially_returned';
  return 'issued';
};

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const { page, pageSize, offset } = parsePagination(req.query);
    const where = [];
    const params = { now: nowIso() };
    const { status, studentId, componentId, overdue, search, from, to } = req.query;

    if (status) {
      where.push('t.status = @status');
      params.status = status;
    }
    if (studentId) {
      where.push('t.student_id = @studentId');
      params.studentId = studentId;
    }
    if (componentId) {
      where.push('t.component_id = @componentId');
      params.componentId = componentId;
    }
    if (overdue === 'true' || overdue === '1') {
      where.push(`t.status IN ${ACTIVE_STATUSES} AND t.due_at < @now`);
    }
    if (search) {
      where.push('(t.code LIKE @search OR s.name LIKE @search OR s.reg_no LIKE @search OR c.name LIKE @search)');
      params.search = `%${search}%`;
    }
    if (from) {
      where.push('t.issued_at >= @from');
      params.from = from;
    }
    if (to) {
      where.push('t.issued_at <= @to');
      params.to = to;
    }

    const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const db = getDb();
    const total = db
      .prepare(
        `SELECT COUNT(*) AS c FROM transactions t
         JOIN students s ON s.id = t.student_id
         JOIN components c ON c.id = t.component_id ${clause}`
      )
      .get(params).c;
    const rows = db
      .prepare(`${TX_SELECT} ${clause} ORDER BY t.issued_at DESC LIMIT @limit OFFSET @offset`)
      .all({ ...params, limit: pageSize, offset });
    res.json(paginated(rows.map((r) => ({ ...r, is_overdue: Boolean(r.is_overdue) })), total, { page, pageSize }));
  })
);

router.get(
  '/overdue',
  asyncHandler(async (_req, res) => {
    const rows = getDb()
      .prepare(
        `${TX_SELECT} WHERE t.status IN ${ACTIVE_STATUSES} AND t.due_at < @now ORDER BY t.due_at ASC`
      )
      .all({ now: nowIso() });
    res.json({ data: rows.map((r) => ({ ...r, is_overdue: true })), count: rows.length });
  })
);

router.get(
  '/export/csv',
  asyncHandler(async (_req, res) => {
    const rows = getDb()
      .prepare(`${TX_SELECT} ORDER BY t.issued_at DESC`)
      .all({ now: nowIso() });
    const csv = toCsv(rows, [
      { label: 'Code', value: (r) => r.code },
      { label: 'Student Reg No', value: (r) => r.student_reg_no },
      { label: 'Student Name', value: (r) => r.student_name },
      { label: 'Component', value: (r) => r.component_name },
      { label: 'Category', value: (r) => r.component_category },
      { label: 'Quantity', value: (r) => r.quantity },
      { label: 'Returned', value: (r) => r.quantity_returned },
      { label: 'Lost', value: (r) => r.quantity_lost },
      { label: 'Status', value: (r) => r.status },
      { label: 'Issued At', value: (r) => r.issued_at },
      { label: 'Due At', value: (r) => r.due_at },
      { label: 'Returned At', value: (r) => r.returned_at },
    ]);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="transactions.csv"');
    res.send(csv);
  })
);

router.post(
  '/issue',
  authorize('admin', 'staff'),
  validate(issueSchema),
  asyncHandler(async (req, res) => {
    const db = getDb();
    const { studentId, componentId, quantity, dueAt, notes } = req.body;

    const student = db.prepare('SELECT * FROM students WHERE id = ?').get(studentId);
    if (!student) throw AppError.notFound('Student not found');
    if (!student.is_active) throw AppError.conflict('Student is inactive', 'STUDENT_INACTIVE');

    const component = db.prepare('SELECT * FROM components WHERE id = ?').get(componentId);
    if (!component) throw AppError.notFound('Component not found');
    if (!component.is_active) throw AppError.conflict('Component is inactive', 'COMPONENT_INACTIVE');
    if (new Date(dueAt).getTime() <= Date.now()) {
      throw AppError.unprocessable('dueAt must be in the future', [{ path: 'dueAt', message: 'Must be a future date' }]);
    }

    const id = uuid();
    const code = generateCode();
    const now = nowIso();

    const run = db.transaction(() => {
      const result = db
        .prepare(
          'UPDATE components SET available_quantity = available_quantity - ?, updated_at = ? WHERE id = ? AND available_quantity >= ?'
        )
        .run(quantity, now, componentId, quantity);
      if (result.changes !== 1) {
        throw AppError.conflict(`Insufficient stock. Only ${component.available_quantity} available.`, 'INSUFFICIENT_STOCK');
      }
      db.prepare(
        `INSERT INTO transactions
          (id, code, student_id, component_id, quantity, status, issued_by, issued_at, due_at, notes, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, 'issued', ?, ?, ?, ?, ?, ?)`
      ).run(id, code, studentId, componentId, quantity, req.user.id, now, dueAt, notes ?? null, now, now);
      db.prepare(
        `INSERT INTO transaction_events (id, transaction_id, type, quantity, notes, actor_id, created_at)
         VALUES (?, ?, 'issued', ?, ?, ?, ?)`
      ).run(uuid(), id, quantity, notes ?? null, req.user.id, now);
    });
    run();

    const created = getTxOr404(id);
    recordAudit({
      actor: req.user,
      action: 'transaction.issued',
      entityType: 'transaction',
      entityId: id,
      after: { code, studentId, componentId, quantity, dueAt },
      req,
    });
    res.status(201).json({ transaction: { ...created, is_overdue: Boolean(created.is_overdue) } });
  })
);

router.post(
  '/:id/return',
  authorize('admin', 'staff'),
  validate(returnSchema),
  asyncHandler(async (req, res) => {
    const db = getDb();
    const tx = getTxOr404(req.params.id);
    if (tx.status === 'returned') throw AppError.conflict('Transaction is already fully returned', 'ALREADY_RETURNED');
    if (tx.status === 'lost') throw AppError.conflict('Transaction is closed as lost', 'ALREADY_LOST');

    const remaining = tx.quantity - tx.quantity_returned - tx.quantity_lost;
    if (req.body.quantity > remaining) {
      throw AppError.unprocessable(`Only ${remaining} unit(s) remain outstanding`, [
        { path: 'quantity', message: `Maximum is ${remaining}` },
      ]);
    }

    const { quantity, condition, notes } = req.body;
    const now = nowIso();
    const newReturned = tx.quantity_returned + quantity;
    const status = deriveStatus(newReturned, tx.quantity_lost, tx.quantity);
    const returnedAt = status === 'returned' ? now : tx.returned_at;

    const run = db.transaction(() => {
      if (condition === 'damaged') {
        // Damaged units are written off rather than returned to available stock.
        db.prepare(
          `UPDATE components
           SET total_quantity = MAX(0, total_quantity - ?),
               available_quantity = MIN(available_quantity, MAX(0, total_quantity - ?)),
               condition = 'damaged', updated_at = ?
           WHERE id = ?`
        ).run(quantity, quantity, now, tx.component_id);
      } else {
        db.prepare(
          `UPDATE components
           SET available_quantity = MIN(total_quantity, available_quantity + ?), updated_at = ?
           WHERE id = ?`
        ).run(quantity, now, tx.component_id);
      }
      db.prepare(
        'UPDATE transactions SET quantity_returned = ?, status = ?, returned_at = ?, updated_at = ? WHERE id = ?'
      ).run(newReturned, status, returnedAt, now, tx.id);
      db.prepare(
        `INSERT INTO transaction_events (id, transaction_id, type, quantity, condition, notes, actor_id, created_at)
         VALUES (?, ?, 'returned', ?, ?, ?, ?, ?)`
      ).run(uuid(), tx.id, quantity, condition, notes ?? null, req.user.id, now);
    });
    run();

    const updated = getTxOr404(tx.id);
    recordAudit({
      actor: req.user,
      action: 'transaction.returned',
      entityType: 'transaction',
      entityId: tx.id,
      before: { quantity_returned: tx.quantity_returned, status: tx.status },
      after: { quantity_returned: updated.quantity_returned, status: updated.status, condition },
      req,
    });
    res.json({ transaction: { ...updated, is_overdue: Boolean(updated.is_overdue) } });
  })
);

router.post(
  '/:id/lost',
  authorize('admin', 'staff'),
  validate(lostSchema),
  asyncHandler(async (req, res) => {
    const db = getDb();
    const tx = getTxOr404(req.params.id);
    if (tx.status === 'returned') throw AppError.conflict('Transaction is already fully returned', 'ALREADY_RETURNED');
    if (tx.status === 'lost') throw AppError.conflict('Transaction is already closed as lost', 'ALREADY_LOST');

    const remaining = tx.quantity - tx.quantity_returned - tx.quantity_lost;
    if (req.body.quantity > remaining) {
      throw AppError.unprocessable(`Only ${remaining} unit(s) remain outstanding`, [
        { path: 'quantity', message: `Maximum is ${remaining}` },
      ]);
    }

    const { quantity, notes } = req.body;
    const now = nowIso();
    const newLost = tx.quantity_lost + quantity;
    const status = deriveStatus(tx.quantity_returned, newLost, tx.quantity);

    const run = db.transaction(() => {
      db.prepare(
        `UPDATE components
         SET total_quantity = MAX(0, total_quantity - ?),
             available_quantity = MIN(available_quantity, MAX(0, total_quantity - ?)),
             updated_at = ?
         WHERE id = ?`
      ).run(quantity, quantity, now, tx.component_id);
      db.prepare('UPDATE transactions SET quantity_lost = ?, status = ?, updated_at = ? WHERE id = ?').run(
        newLost,
        status,
        now,
        tx.id
      );
      db.prepare(
        `INSERT INTO transaction_events (id, transaction_id, type, quantity, notes, actor_id, created_at)
         VALUES (?, ?, 'lost', ?, ?, ?, ?)`
      ).run(uuid(), tx.id, quantity, notes ?? null, req.user.id, now);
    });
    run();

    const updated = getTxOr404(tx.id);
    recordAudit({
      actor: req.user,
      action: 'transaction.lost',
      entityType: 'transaction',
      entityId: tx.id,
      before: { quantity_lost: tx.quantity_lost, status: tx.status },
      after: { quantity_lost: updated.quantity_lost, status: updated.status },
      req,
    });
    res.json({ transaction: { ...updated, is_overdue: Boolean(updated.is_overdue) } });
  })
);

router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const tx = getTxOr404(req.params.id);
    const events = getDb()
      .prepare(
        `SELECT e.*, u.username AS actor_username, u.full_name AS actor_name
         FROM transaction_events e LEFT JOIN users u ON u.id = e.actor_id
         WHERE e.transaction_id = ? ORDER BY e.created_at ASC`
      )
      .all(tx.id);
    res.json({ transaction: { ...tx, is_overdue: Boolean(tx.is_overdue) }, events });
  })
);

module.exports = router;
