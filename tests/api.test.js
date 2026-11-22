'use strict';

const request = require('supertest');
const { createApp } = require('../src/app');
const { ensureAdmin } = require('../src/services/bootstrap');
const { closeDb, getDb } = require('../src/db');

let app;
let adminToken;
let staffToken;
let studentId;
let componentId;

const auth = (token) => ({ Authorization: `Bearer ${token}` });
const future = (days = 7) => new Date(Date.now() + days * 86400000).toISOString();

beforeAll(async () => {
  app = createApp();
  await ensureAdmin();

  const login = await request(app)
    .post('/api/auth/login')
    .send({ username: 'admin', password: 'Admin@12345' });
  adminToken = login.body.accessToken;

  const staffCreate = await request(app)
    .post('/api/users')
    .set(auth(adminToken))
    .send({
      username: 'staff1',
      email: 'staff1@test.local',
      fullName: 'Staff One',
      password: 'Staff@12345',
      role: 'staff',
    });
  expect(staffCreate.status).toBe(201);

  const staffLogin = await request(app)
    .post('/api/auth/login')
    .send({ username: 'staff1', password: 'Staff@12345' });
  staffToken = staffLogin.body.accessToken;
});

afterAll(() => {
  closeDb();
});

describe('health', () => {
  test('liveness returns ok', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });

  test('readiness checks the database', async () => {
    const res = await request(app).get('/health/ready');
    expect(res.status).toBe(200);
    expect(res.body.database).toBe('ok');
  });
});

describe('authentication', () => {
  test('rejects invalid credentials with a generic message', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: 'admin', password: 'wrong-password' });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('INVALID_CREDENTIALS');
    expect(res.body.error.message).toBe('Invalid username or password');
  });

  test('validates the login payload', async () => {
    const res = await request(app).post('/api/auth/login').send({ username: '' });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('UNPROCESSABLE_ENTITY');
  });

  test('returns the current user for a valid token', async () => {
    const res = await request(app).get('/api/auth/me').set(auth(adminToken));
    expect(res.status).toBe(200);
    expect(res.body.user.role).toBe('admin');
    expect(res.body.user.password_hash).toBeUndefined();
  });

  test('rejects requests without a token', async () => {
    const res = await request(app).get('/api/components');
    expect(res.status).toBe(401);
  });

  test('rotates refresh tokens and revokes the old one', async () => {
    const login = await request(app)
      .post('/api/auth/login')
      .send({ username: 'admin', password: 'Admin@12345' });
    const firstRefresh = login.body.refreshToken;

    const rotated = await request(app).post('/api/auth/refresh').send({ refreshToken: firstRefresh });
    expect(rotated.status).toBe(200);
    expect(rotated.body.refreshToken).not.toBe(firstRefresh);

    const reuse = await request(app).post('/api/auth/refresh').send({ refreshToken: firstRefresh });
    expect(reuse.status).toBe(401);
    expect(reuse.body.error.code).toBe('REFRESH_TOKEN_REVOKED');
  });
});

describe('role-based access control', () => {
  test('staff cannot access user administration', async () => {
    const res = await request(app).get('/api/users').set(auth(staffToken));
    expect(res.status).toBe(403);
  });

  test('staff cannot access audit logs', async () => {
    const res = await request(app).get('/api/audit').set(auth(staffToken));
    expect(res.status).toBe(403);
  });

  test('admin can list users', async () => {
    const res = await request(app).get('/api/users').set(auth(adminToken));
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThanOrEqual(2);
    expect(res.body.data[0].password_hash).toBeUndefined();
  });
});

describe('students', () => {
  test('creates a student', async () => {
    const res = await request(app)
      .post('/api/students')
      .set(auth(adminToken))
      .send({ regNo: 'TEST-001', name: 'Test Student', email: 'test.student@ece.local', dept: 'ECE', year: 2 });
    expect(res.status).toBe(201);
    expect(res.body.student.reg_no).toBe('TEST-001');
    studentId = res.body.student.id;
  });

  test('rejects a duplicate registration number', async () => {
    const res = await request(app)
      .post('/api/students')
      .set(auth(adminToken))
      .send({ regNo: 'TEST-001', name: 'Another Student' });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('CONFLICT');
  });

  test('lists and searches students', async () => {
    const res = await request(app).get('/api/students?search=Test&pageSize=5').set(auth(adminToken));
    expect(res.status).toBe(200);
    expect(res.body.data.some((s) => s.reg_no === 'TEST-001')).toBe(true);
    expect(res.body.pagination).toHaveProperty('totalPages');
  });

  test('validates student input', async () => {
    const res = await request(app).post('/api/students').set(auth(adminToken)).send({ regNo: 'X' });
    expect(res.status).toBe(422);
    expect(Array.isArray(res.body.error.details)).toBe(true);
  });
});

describe('components and QR', () => {
  test('creates a component with an auto-generated QR code', async () => {
    const res = await request(app)
      .post('/api/components')
      .set(auth(staffToken))
      .send({ name: 'Test Resistor', category: 'Passive', totalQuantity: 10, minStock: 2, unitCost: 1.5 });
    expect(res.status).toBe(201);
    expect(res.body.component.qr_code).toMatch(/^ECE-/);
    expect(res.body.component.available_quantity).toBe(10);
    componentId = res.body.component.id;
  });

  test('rejects availableQuantity greater than totalQuantity', async () => {
    const res = await request(app)
      .post('/api/components')
      .set(auth(adminToken))
      .send({ name: 'Bad Stock', totalQuantity: 2, availableQuantity: 5 });
    expect(res.status).toBe(422);
  });

  test('looks up a component by QR code', async () => {
    const detail = await request(app).get(`/api/components/${componentId}`).set(auth(adminToken));
    const res = await request(app)
      .get(`/api/components/by-qr/${detail.body.component.qr_code}`)
      .set(auth(adminToken));
    expect(res.status).toBe(200);
    expect(res.body.component.id).toBe(componentId);
  });

  test('generates a QR data URL', async () => {
    const res = await request(app).get(`/api/components/${componentId}/qr`).set(auth(adminToken));
    expect(res.status).toBe(200);
    expect(res.body.dataUrl).toMatch(/^data:image\/png;base64,/);
  });

  test('restocks a component', async () => {
    const res = await request(app)
      .post(`/api/components/${componentId}/restock`)
      .set(auth(adminToken))
      .send({ quantity: 5 });
    expect(res.status).toBe(200);
    expect(res.body.component.total_quantity).toBe(15);
    expect(res.body.component.available_quantity).toBe(15);
  });

  test('exports inventory as CSV', async () => {
    const res = await request(app).get('/api/components/export/csv').set(auth(adminToken));
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/csv/);
    expect(res.text.split('\n')[0]).toContain('QR Code');
  });
});

describe('transactions: issue, return, lost', () => {
  let txId;

  test('issues a component and decrements available stock', async () => {
    const res = await request(app)
      .post('/api/transactions/issue')
      .set(auth(adminToken))
      .send({ studentId, componentId, quantity: 3, dueAt: future(7), notes: 'integration test' });
    expect(res.status).toBe(201);
    expect(res.body.transaction.status).toBe('issued');
    txId = res.body.transaction.id;

    const comp = await request(app).get(`/api/components/${componentId}`).set(auth(adminToken));
    expect(comp.body.component.available_quantity).toBe(12);
  });

  test('rejects issuing more than available stock', async () => {
    const res = await request(app)
      .post('/api/transactions/issue')
      .set(auth(adminToken))
      .send({ studentId, componentId, quantity: 999, dueAt: future(7) });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('INSUFFICIENT_STOCK');
  });

  test('rejects a due date in the past', async () => {
    const res = await request(app)
      .post('/api/transactions/issue')
      .set(auth(adminToken))
      .send({ studentId, componentId, quantity: 1, dueAt: future(-2) });
    expect(res.status).toBe(422);
  });

  test('prevents reducing total stock below issued units', async () => {
    const res = await request(app)
      .patch(`/api/components/${componentId}`)
      .set(auth(adminToken))
      .send({ totalQuantity: 2 });
    expect(res.status).toBe(422);
  });

  test('records a partial return and restores available stock', async () => {
    const res = await request(app)
      .post(`/api/transactions/${txId}/return`)
      .set(auth(adminToken))
      .send({ quantity: 1, condition: 'good' });
    expect(res.status).toBe(200);
    expect(res.body.transaction.status).toBe('partially_returned');
    expect(res.body.transaction.quantity_returned).toBe(1);

    const comp = await request(app).get(`/api/components/${componentId}`).set(auth(adminToken));
    expect(comp.body.component.available_quantity).toBe(13);
  });

  test('rejects returning more than outstanding', async () => {
    const res = await request(app)
      .post(`/api/transactions/${txId}/return`)
      .set(auth(adminToken))
      .send({ quantity: 99, condition: 'good' });
    expect(res.status).toBe(422);
  });

  test('completes the return', async () => {
    const res = await request(app)
      .post(`/api/transactions/${txId}/return`)
      .set(auth(adminToken))
      .send({ quantity: 2, condition: 'good' });
    expect(res.status).toBe(200);
    expect(res.body.transaction.status).toBe('returned');
  });

  test('marks units lost and writes them off inventory', async () => {
    const issue = await request(app)
      .post('/api/transactions/issue')
      .set(auth(adminToken))
      .send({ studentId, componentId, quantity: 2, dueAt: future(3) });
    const lostTx = issue.body.transaction.id;

    const before = await request(app).get(`/api/components/${componentId}`).set(auth(adminToken));
    const res = await request(app)
      .post(`/api/transactions/${lostTx}/lost`)
      .set(auth(adminToken))
      .send({ quantity: 2, notes: 'dropped' });
    expect(res.status).toBe(200);
    expect(res.body.transaction.status).toBe('lost');

    const after = await request(app).get(`/api/components/${componentId}`).set(auth(adminToken));
    expect(after.body.component.total_quantity).toBe(before.body.component.total_quantity - 2);
  });

  test('returns transaction detail with an event timeline', async () => {
    const res = await request(app).get(`/api/transactions/${txId}`).set(auth(adminToken));
    expect(res.status).toBe(200);
    expect(res.body.events.length).toBeGreaterThanOrEqual(3);
    expect(res.body.events.map((e) => e.type)).toEqual(expect.arrayContaining(['issued', 'returned']));
  });

  test('filters overdue transactions', async () => {
    const issue = await request(app)
      .post('/api/transactions/issue')
      .set(auth(adminToken))
      .send({ studentId, componentId, quantity: 1, dueAt: future(1) });
    // Force the due date into the past to simulate an overdue loan.
    getDb().prepare('UPDATE transactions SET due_at = ? WHERE id = ?').run(future(-3), issue.body.transaction.id);

    const res = await request(app).get('/api/transactions/overdue').set(auth(adminToken));
    expect(res.status).toBe(200);
    expect(res.body.count).toBeGreaterThanOrEqual(1);
    expect(res.body.data.every((t) => t.is_overdue)).toBe(true);
  });

  test('exports transactions as CSV', async () => {
    const res = await request(app).get('/api/transactions/export/csv').set(auth(adminToken));
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/csv/);
  });
});

describe('dashboard and audit', () => {
  test('returns a KPI summary', async () => {
    const res = await request(app).get('/api/dashboard/summary').set(auth(adminToken));
    expect(res.status).toBe(200);
    expect(res.body.components).toHaveProperty('total_components');
    expect(res.body.transactions).toHaveProperty('overdue');
  });

  test('returns an activity series', async () => {
    const res = await request(app).get('/api/dashboard/activity?days=14').set(auth(adminToken));
    expect(res.status).toBe(200);
    expect(res.body.series).toHaveLength(14);
  });

  test('records audit entries for mutations', async () => {
    const res = await request(app)
      .get('/api/audit?search=component.created')
      .set(auth(adminToken));
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThanOrEqual(1);
    expect(res.body.data[0].action).toBe('component.created');
  });
});

describe('security and errors', () => {
  test('returns 404 for unknown API routes', async () => {
    const res = await request(app).get('/api/does-not-exist').set(auth(adminToken));
    expect(res.status).toBe(404);
  });

  test('rejects malformed JSON bodies', async () => {
    const res = await request(app)
      .post('/api/students')
      .set(auth(adminToken))
      .set('Content-Type', 'application/json')
      .send('{"name":');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_JSON');
  });

  test('does not leak password hashes in user payloads', async () => {
    const res = await request(app).get('/api/users').set(auth(adminToken));
    res.body.data.forEach((u) => expect(u.password_hash).toBeUndefined());
  });
});
