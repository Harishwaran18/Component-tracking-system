'use strict';

const express = require('express');
const { getDb } = require('../db');
const { asyncHandler, nowIso } = require('../utils/http');
const { authenticate } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);

const ACTIVE_STATUSES = "('issued','partially_returned')";

router.get(
  '/summary',
  asyncHandler(async (_req, res) => {
    const db = getDb();
    const now = nowIso();
    const today = now.slice(0, 10);

    const components = db
      .prepare(
        `SELECT COUNT(*) AS total_components,
                COALESCE(SUM(total_quantity),0) AS total_units,
                COALESCE(SUM(available_quantity),0) AS available_units,
                COALESCE(SUM(CASE WHEN available_quantity <= min_stock THEN 1 ELSE 0 END),0) AS low_stock,
                COALESCE(SUM(CASE WHEN condition = 'damaged' THEN 1 ELSE 0 END),0) AS damaged
         FROM components WHERE is_active = 1`
      )
      .get();

    const students = db.prepare('SELECT COUNT(*) AS c FROM students WHERE is_active = 1').get().c;
    const users = db.prepare('SELECT COUNT(*) AS c FROM users WHERE is_active = 1').get().c;

    const loans = db
      .prepare(
        `SELECT COUNT(*) AS active_loans,
                COALESCE(SUM(quantity - quantity_returned - quantity_lost),0) AS units_out,
                COALESCE(SUM(CASE WHEN due_at < ? THEN 1 ELSE 0 END),0) AS overdue
         FROM transactions WHERE status IN ${ACTIVE_STATUSES}`
      )
      .get(now);

    const issuedToday = db
      .prepare("SELECT COUNT(*) AS c FROM transactions WHERE substr(issued_at,1,10) = ?")
      .get(today).c;
    const returnedToday = db
      .prepare("SELECT COALESCE(SUM(quantity),0) AS c FROM transaction_events WHERE type = 'returned' AND substr(created_at,1,10) = ?")
      .get(today).c;
    const totalTransactions = db.prepare('SELECT COUNT(*) AS c FROM transactions').get().c;

    const inventoryValue = db
      .prepare('SELECT COALESCE(SUM(available_quantity * unit_cost),0) AS v FROM components WHERE is_active = 1')
      .get().v;

    res.json({
      components: {
        ...components,
        issued_units: components.total_units - components.available_units,
      },
      students,
      users,
      transactions: {
        total: totalTransactions,
        active_loans: loans.active_loans,
        units_out: loans.units_out,
        overdue: loans.overdue,
        issued_today: issuedToday,
        returned_today: returnedToday,
      },
      inventory_value: Number(inventoryValue.toFixed(2)),
    });
  })
);

router.get(
  '/activity',
  asyncHandler(async (req, res) => {
    const days = Math.min(90, Math.max(7, Number.parseInt(req.query.days, 10) || 30));
    const db = getDb();
    const since = new Date(Date.now() - (days - 1) * 86400000).toISOString().slice(0, 10);

    const issued = db
      .prepare(
        `SELECT substr(issued_at,1,10) AS date, COUNT(*) AS count
         FROM transactions WHERE substr(issued_at,1,10) >= ? GROUP BY date`
      )
      .all(since);
    const returned = db
      .prepare(
        `SELECT substr(created_at,1,10) AS date, COALESCE(SUM(quantity),0) AS count
         FROM transaction_events WHERE type = 'returned' AND substr(created_at,1,10) >= ? GROUP BY date`
      )
      .all(since);

    const issuedMap = new Map(issued.map((r) => [r.date, r.count]));
    const returnedMap = new Map(returned.map((r) => [r.date, r.count]));
    const series = [];
    for (let i = days - 1; i >= 0; i -= 1) {
      const d = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);
      series.push({ date: d, issued: issuedMap.get(d) || 0, returned: returnedMap.get(d) || 0 });
    }
    res.json({ days, series });
  })
);

router.get(
  '/top-components',
  asyncHandler(async (req, res) => {
    const limit = Math.min(20, Math.max(1, Number.parseInt(req.query.limit, 10) || 5));
    const rows = getDb()
      .prepare(
        `SELECT c.id, c.name, c.category,
                COALESCE(SUM(t.quantity),0) AS total_issued,
                COALESCE(SUM(CASE WHEN t.status IN ${ACTIVE_STATUSES} THEN t.quantity - t.quantity_returned - t.quantity_lost ELSE 0 END),0) AS units_out
         FROM components c LEFT JOIN transactions t ON t.component_id = c.id
         WHERE c.is_active = 1 GROUP BY c.id ORDER BY total_issued DESC LIMIT ?`
      )
      .all(limit);
    res.json({ data: rows });
  })
);

router.get(
  '/category-distribution',
  asyncHandler(async (_req, res) => {
    const rows = getDb()
      .prepare(
        `SELECT category, COUNT(*) AS components, COALESCE(SUM(available_quantity),0) AS available
         FROM components WHERE is_active = 1 GROUP BY category ORDER BY available DESC`
      )
      .all();
    res.json({ data: rows });
  })
);

router.get(
  '/recent-transactions',
  asyncHandler(async (req, res) => {
    const limit = Math.min(50, Math.max(1, Number.parseInt(req.query.limit, 10) || 8));
    const rows = getDb()
      .prepare(
        `SELECT t.id, t.code, t.quantity, t.quantity_returned, t.quantity_lost, t.status, t.issued_at, t.due_at,
                s.name AS student_name, s.reg_no AS student_reg_no,
                c.name AS component_name,
                CASE WHEN t.status IN ${ACTIVE_STATUSES} AND t.due_at < ? THEN 1 ELSE 0 END AS is_overdue
         FROM transactions t
         JOIN students s ON s.id = t.student_id
         JOIN components c ON c.id = t.component_id
         ORDER BY t.issued_at DESC LIMIT ?`
      )
      .all(nowIso(), limit);
    res.json({ data: rows.map((r) => ({ ...r, is_overdue: Boolean(r.is_overdue) })) });
  })
);

router.get(
  '/low-stock',
  asyncHandler(async (req, res) => {
    const limit = Math.min(50, Math.max(1, Number.parseInt(req.query.limit, 10) || 10));
    const rows = getDb()
      .prepare(
        `SELECT id, qr_code, name, category, available_quantity, min_stock, total_quantity
         FROM components WHERE is_active = 1 AND available_quantity <= min_stock
         ORDER BY (available_quantity - min_stock) ASC, name COLLATE NOCASE LIMIT ?`
      )
      .all(limit);
    res.json({ data: rows });
  })
);

module.exports = router;
