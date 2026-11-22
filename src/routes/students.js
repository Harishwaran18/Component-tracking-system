'use strict';

const express = require('express');
const { v4: uuid } = require('uuid');
const { getDb } = require('../db');
const { AppError } = require('../utils/errors');
const { asyncHandler, nowIso, parsePagination, paginated, boolToInt } = require('../utils/http');
const { recordAudit } = require('../services/audit');
const { authenticate, authorize } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const { createStudentSchema, updateStudentSchema } = require('../validation/schemas');

const router = express.Router();
router.use(authenticate);

const ACTIVE_STATUSES = "('issued','partially_returned')";

function getStudentOr404(id) {
  const student = getDb().prepare('SELECT * FROM students WHERE id = ?').get(id);
  if (!student) throw AppError.notFound('Student not found');
  return student;
}

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const { page, pageSize, offset } = parsePagination(req.query);
    const { search, dept, active } = req.query;
    const where = [];
    const params = [];
    if (search) {
      where.push('(reg_no LIKE ? OR name LIKE ? OR email LIKE ?)');
      const q = `%${search}%`;
      params.push(q, q, q);
    }
    if (dept) {
      where.push('dept = ?');
      params.push(dept);
    }
    if (active !== undefined) {
      where.push('is_active = ?');
      params.push(boolToInt(active === 'true' || active === '1'));
    }
    const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const db = getDb();
    const total = db.prepare(`SELECT COUNT(*) AS c FROM students ${clause}`).get(...params).c;
    const rows = db
      .prepare(
        `SELECT s.*,
          (SELECT COUNT(*) FROM transactions t WHERE t.student_id = s.id AND t.status IN ${ACTIVE_STATUSES}) AS active_loans
         FROM students s ${clause} ORDER BY s.created_at DESC LIMIT ? OFFSET ?`
      )
      .all(...params, pageSize, offset);
    res.json(paginated(rows.map((r) => ({ ...r, is_active: Boolean(r.is_active) })), total, { page, pageSize }));
  })
);

router.post(
  '/',
  authorize('admin', 'staff'),
  validate(createStudentSchema),
  asyncHandler(async (req, res) => {
    const db = getDb();
    const { regNo, name, email, phone, dept, year, notes } = req.body;
    if (db.prepare('SELECT id FROM students WHERE reg_no = ?').get(regNo)) {
      throw AppError.conflict('A student with this registration number already exists');
    }
    const id = uuid();
    db.prepare(
      `INSERT INTO students (id, reg_no, name, email, phone, dept, year, notes, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(id, regNo, name, email ?? null, phone ?? null, dept, year ?? null, notes ?? null, nowIso(), nowIso());
    const created = getStudentOr404(id);
    recordAudit({ actor: req.user, action: 'student.created', entityType: 'student', entityId: id, after: created, req });
    res.status(201).json({ student: created });
  })
);

router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const db = getDb();
    const student = getStudentOr404(req.params.id);
    const stats = db
      .prepare(
        `SELECT
          COUNT(*) AS total_loans,
          COALESCE(SUM(CASE WHEN status IN ${ACTIVE_STATUSES} THEN 1 ELSE 0 END), 0) AS active_loans,
          COALESCE(SUM(CASE WHEN status IN ${ACTIVE_STATUSES} THEN quantity - quantity_returned - quantity_lost ELSE 0 END), 0) AS units_out
         FROM transactions WHERE student_id = ?`
      )
      .get(student.id);
    res.json({ student: { ...student, is_active: Boolean(student.is_active) }, stats });
  })
);

router.patch(
  '/:id',
  authorize('admin', 'staff'),
  validate(updateStudentSchema),
  asyncHandler(async (req, res) => {
    const db = getDb();
    const student = getStudentOr404(req.params.id);
    const map = { regNo: 'reg_no', name: 'name', email: 'email', phone: 'phone', dept: 'dept', year: 'year', notes: 'notes', isActive: 'is_active' };
    const updates = [];
    const params = [];
    for (const [key, column] of Object.entries(map)) {
      if (req.body[key] !== undefined) {
        updates.push(`${column} = ?`);
        params.push(key === 'isActive' ? boolToInt(req.body[key]) : req.body[key]);
      }
    }
    if (req.body.regNo && req.body.regNo !== student.reg_no) {
      if (db.prepare('SELECT id FROM students WHERE reg_no = ? AND id != ?').get(req.body.regNo, student.id)) {
        throw AppError.conflict('Registration number already in use');
      }
    }
    updates.push('updated_at = ?');
    params.push(nowIso());
    db.prepare(`UPDATE students SET ${updates.join(', ')} WHERE id = ?`).run(...params, student.id);
    const updated = getStudentOr404(student.id);
    recordAudit({ actor: req.user, action: 'student.updated', entityType: 'student', entityId: student.id, before: student, after: updated, req });
    res.json({ student: { ...updated, is_active: Boolean(updated.is_active) } });
  })
);

router.delete(
  '/:id',
  authorize('admin', 'staff'),
  asyncHandler(async (req, res) => {
    const db = getDb();
    const student = getStudentOr404(req.params.id);
    const active = db
      .prepare(`SELECT COUNT(*) AS c FROM transactions WHERE student_id = ? AND status IN ${ACTIVE_STATUSES}`)
      .get(student.id).c;
    if (active > 0) throw AppError.conflict('Cannot deactivate a student with active loans', 'ACTIVE_LOANS');
    db.prepare('UPDATE students SET is_active = 0, updated_at = ? WHERE id = ?').run(nowIso(), student.id);
    recordAudit({ actor: req.user, action: 'student.deactivated', entityType: 'student', entityId: student.id, before: student, req });
    res.status(204).send();
  })
);

router.get(
  '/:id/transactions',
  asyncHandler(async (req, res) => {
    const student = getStudentOr404(req.params.id);
    const { page, pageSize, offset } = parsePagination(req.query);
    const db = getDb();
    const total = db.prepare('SELECT COUNT(*) AS c FROM transactions WHERE student_id = ?').get(student.id).c;
    const rows = db
      .prepare(
        `SELECT t.*, c.name AS component_name, c.category AS component_category
         FROM transactions t JOIN components c ON c.id = t.component_id
         WHERE t.student_id = ? ORDER BY t.issued_at DESC LIMIT ? OFFSET ?`
      )
      .all(student.id, pageSize, offset);
    res.json(paginated(rows, total, { page, pageSize }));
  })
);

module.exports = router;
