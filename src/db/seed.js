'use strict';

const { v4: uuid } = require('uuid');
const { getDb } = require('../db');
const { migrate } = require('./migrate');
const { ensureAdmin } = require('../services/bootstrap');
const { hashPassword } = require('../utils/password');
const { nowIso } = require('../utils/http');
const logger = require('../utils/logger');

const daysFromNow = (n) => new Date(Date.now() + n * 86400000).toISOString();
const daysAgo = (n) => new Date(Date.now() - n * 86400000).toISOString();

const STUDENTS = [
  { regNo: 'ECE21CS001', name: 'Aarav Kumar', email: 'aarav.kumar@ece.local', phone: '9876543210', dept: 'ECE', year: 3 },
  { regNo: 'ECE21CS002', name: 'Divya Ramesh', email: 'divya.ramesh@ece.local', phone: '9876543211', dept: 'ECE', year: 3 },
  { regNo: 'ECE22EC014', name: 'Harishwaran S', email: 'harishwaran.s@ece.local', phone: '9876543212', dept: 'ECE', year: 2 },
  { regNo: 'ECE22EC027', name: 'Meena Lakshmi', email: 'meena.lakshmi@ece.local', phone: '9876543213', dept: 'ECE', year: 2 },
  { regNo: 'ECE20EE009', name: 'Rahul Verma', email: 'rahul.verma@ece.local', phone: '9876543214', dept: 'EEE', year: 4 },
  { regNo: 'ECE23CS031', name: 'Sneha Priya', email: 'sneha.priya@ece.local', phone: '9876543215', dept: 'CSE', year: 1 },
];

const COMPONENTS = [
  { name: 'Arduino Uno R3', category: 'Microcontrollers', location: 'Rack A-1', total: 25, min: 5, cost: 650, condition: 'good', desc: 'ATmega328P development board' },
  { name: 'ESP32 DevKit V1', category: 'Microcontrollers', location: 'Rack A-2', total: 20, min: 4, cost: 480, condition: 'good', desc: 'Dual-core Wi-Fi + BLE module' },
  { name: 'Raspberry Pi 4 Model B (4GB)', category: 'Microcontrollers', location: 'Rack A-3', total: 8, min: 2, cost: 5200, condition: 'good', desc: 'Single board computer' },
  { name: 'LM358 Op-Amp', category: 'Analog ICs', location: 'Rack B-1', total: 120, min: 25, cost: 12, condition: 'good', desc: 'Dual operational amplifier' },
  { name: 'NE555 Timer IC', category: 'Analog ICs', location: 'Rack B-2', total: 90, min: 20, cost: 9, condition: 'good', desc: 'Precision timer' },
  { name: '1N4007 Diode', category: 'Discrete', location: 'Rack C-1', total: 300, min: 50, cost: 2, condition: 'good', desc: '1A rectifier diode' },
  { name: 'BC547 NPN Transistor', category: 'Discrete', location: 'Rack C-2', total: 250, min: 50, cost: 3, condition: 'good', desc: 'General purpose transistor' },
  { name: '10k Ohm Resistor (1/4W)', category: 'Passive', location: 'Rack D-1', total: 500, min: 100, cost: 1, condition: 'good', desc: 'Carbon film resistor' },
  { name: '100uF 25V Capacitor', category: 'Passive', location: 'Rack D-2', total: 150, min: 30, cost: 5, condition: 'good', desc: 'Electrolytic capacitor' },
  { name: 'Digital Multimeter DT830B', category: 'Instruments', location: 'Cabinet E-1', total: 12, min: 3, cost: 850, condition: 'fair', desc: 'Handheld multimeter' },
  { name: 'Soldering Iron 25W', category: 'Tools', location: 'Cabinet E-2', total: 15, min: 4, cost: 420, condition: 'good', desc: 'Pencil soldering iron' },
  { name: 'Breadboard 830 Point', category: 'Prototyping', location: 'Rack F-1', total: 40, min: 10, cost: 120, condition: 'good', desc: 'Solderless breadboard' },
];

async function seedDemo() {
  const db = getDb();

  // Demo staff account
  if (!db.prepare("SELECT id FROM users WHERE username = 'staff'").get()) {
    const hash = await hashPassword('Staff@12345');
    db.prepare(
      `INSERT INTO users (id, username, email, full_name, password_hash, role, created_at, updated_at)
       VALUES (?, 'staff', 'staff@ece.local', 'Lab Staff', ?, 'staff', ?, ?)`
    ).run(uuid(), hash, nowIso(), nowIso());
  }

  const existingStudents = db.prepare('SELECT COUNT(*) AS c FROM students').get().c;
  if (existingStudents === 0) {
    const insert = db.prepare(
      `INSERT INTO students (id, reg_no, name, email, phone, dept, year, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );
    for (const s of STUDENTS) insert.run(uuid(), s.regNo, s.name, s.email, s.phone, s.dept, s.year, nowIso(), nowIso());
  }

  const existingComponents = db.prepare('SELECT COUNT(*) AS c FROM components').get().c;
  if (existingComponents === 0) {
    const insert = db.prepare(
      `INSERT INTO components
        (id, qr_code, name, category, description, location, unit, total_quantity, available_quantity, min_stock, unit_cost, condition, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 'pcs', ?, ?, ?, ?, ?, ?, ?)`
    );
    for (const c of COMPONENTS) {
      const code = `ECE-${uuid().replace(/-/g, '').slice(0, 10).toUpperCase()}`;
      insert.run(uuid(), code, c.name, c.category, c.desc, c.location, c.total, c.total, c.min, c.cost, c.condition, nowIso(), nowIso());
    }
  }

  const existingTx = db.prepare('SELECT COUNT(*) AS c FROM transactions').get().c;
  if (existingTx === 0) {
    const students = db.prepare('SELECT id, reg_no FROM students ORDER BY reg_no').all();
    const components = db.prepare('SELECT id, name FROM components ORDER BY name').all();
    const staff = db.prepare("SELECT id FROM users WHERE role IN ('admin','staff') ORDER BY role LIMIT 1").get();
    const pick = (arr, i) => arr[i % arr.length];

    const samples = [
      { s: 0, c: 0, qty: 3, issued: -12, due: 2, returned: 0, status: 'issued' },
      { s: 1, c: 3, qty: 20, issued: -9, due: -2, returned: 0, status: 'issued' },
      { s: 2, c: 9, qty: 1, issued: -20, due: -6, returned: 0, status: 'issued' },
      { s: 3, c: 1, qty: 4, issued: -6, due: 4, returned: 2, status: 'partially_returned' },
      { s: 4, c: 11, qty: 2, issued: -30, due: -20, returned: 2, status: 'returned' },
      { s: 5, c: 5, qty: 20, issued: -3, due: 10, returned: 0, status: 'issued' },
    ];

    for (const t of samples) {
      const student = pick(students, t.s);
      const component = pick(components, t.c);
      const id = uuid();
      const issuedAt = daysAgo(-t.issued);
      const dueAt = daysFromNow(t.due);
      const returnedAt = t.status === 'returned' ? nowIso() : null;
      const code = `TXN-DEMO-${uuid().replace(/-/g, '').slice(0, 6).toUpperCase()}`;
      const run = db.transaction(() => {
        db.prepare('UPDATE components SET available_quantity = available_quantity - ? WHERE id = ?').run(t.qty, component.id);
        db.prepare(
          `INSERT INTO transactions
            (id, code, student_id, component_id, quantity, quantity_returned, status, issued_by, issued_at, due_at, returned_at, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).run(id, code, student.id, component.id, t.qty, t.returned, t.status, staff?.id || null, issuedAt, dueAt, returnedAt, issuedAt, nowIso());
        db.prepare(
          `INSERT INTO transaction_events (id, transaction_id, type, quantity, actor_id, created_at)
           VALUES (?, ?, 'issued', ?, ?, ?)`
        ).run(uuid(), id, t.qty, staff?.id || null, issuedAt);
        if (t.returned > 0) {
          db.prepare(
            `INSERT INTO transaction_events (id, transaction_id, type, quantity, condition, actor_id, created_at)
             VALUES (?, ?, 'returned', ?, 'good', ?, ?)`
          ).run(uuid(), id, t.returned, staff?.id || null, nowIso());
          if (t.status === 'returned') {
            db.prepare('UPDATE components SET available_quantity = MIN(total_quantity, available_quantity + ?) WHERE id = ?').run(t.returned, component.id);
          }
        }
      });
      run();
    }
  }

  const counts = {
    users: db.prepare('SELECT COUNT(*) AS c FROM users').get().c,
    students: db.prepare('SELECT COUNT(*) AS c FROM students').get().c,
    components: db.prepare('SELECT COUNT(*) AS c FROM components').get().c,
    transactions: db.prepare('SELECT COUNT(*) AS c FROM transactions').get().c,
  };
  logger.info({ counts }, 'demo seed complete');
  return counts;
}

async function main() {
  migrate();
  await ensureAdmin();
  const demo = process.argv.includes('--demo') || process.env.SEED_DEMO === 'true';
  if (demo) {
    await seedDemo();
  } else {
    const db = getDb();
    logger.info(
      { users: db.prepare('SELECT COUNT(*) AS c FROM users').get().c },
      'seed complete (admin ensured). Run with --demo for sample data.'
    );
  }
}

if (require.main === module) {
  main()
    .then(() => process.exit(0))
    .catch((err) => {
      logger.error({ err }, 'seed failed');
      process.exit(1);
    });
}

module.exports = { seedDemo };
