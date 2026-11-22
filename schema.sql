-- ECE Component Tracking System — schema (SQLite)
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS schema_migrations (
  version    TEXT PRIMARY KEY,
  applied_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS users (
  id              TEXT PRIMARY KEY,
  username        TEXT NOT NULL UNIQUE COLLATE NOCASE,
  email           TEXT NOT NULL UNIQUE COLLATE NOCASE,
  full_name       TEXT NOT NULL,
  password_hash   TEXT NOT NULL,
  role            TEXT NOT NULL DEFAULT 'student' CHECK (role IN ('admin','staff','student')),
  is_active       INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0,1)),
  failed_attempts INTEGER NOT NULL DEFAULT 0,
  locked_until    TEXT,
  last_login_at   TEXT,
  created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);

CREATE TABLE IF NOT EXISTS refresh_tokens (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash  TEXT NOT NULL UNIQUE,
  expires_at  TEXT NOT NULL,
  revoked_at  TEXT,
  replaced_by TEXT,
  user_agent  TEXT,
  ip          TEXT,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_refresh_user ON refresh_tokens(user_id);

CREATE TABLE IF NOT EXISTS students (
  id         TEXT PRIMARY KEY,
  reg_no     TEXT NOT NULL UNIQUE COLLATE NOCASE,
  name       TEXT NOT NULL,
  email      TEXT COLLATE NOCASE,
  phone      TEXT,
  dept       TEXT NOT NULL DEFAULT 'ECE',
  year       INTEGER CHECK (year IS NULL OR (year BETWEEN 1 AND 6)),
  is_active  INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0,1)),
  notes      TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_students_dept ON students(dept);

CREATE TABLE IF NOT EXISTS components (
  id                 TEXT PRIMARY KEY,
  qr_code            TEXT NOT NULL UNIQUE,
  name               TEXT NOT NULL,
  category           TEXT NOT NULL DEFAULT 'General',
  description        TEXT,
  location           TEXT,
  unit               TEXT NOT NULL DEFAULT 'pcs',
  total_quantity     INTEGER NOT NULL DEFAULT 0 CHECK (total_quantity >= 0),
  available_quantity INTEGER NOT NULL DEFAULT 0 CHECK (available_quantity >= 0),
  min_stock          INTEGER NOT NULL DEFAULT 0 CHECK (min_stock >= 0),
  unit_cost          REAL NOT NULL DEFAULT 0 CHECK (unit_cost >= 0),
  condition          TEXT NOT NULL DEFAULT 'good' CHECK (condition IN ('good','fair','damaged')),
  is_active          INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0,1)),
  created_at         TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at         TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  CHECK (available_quantity <= total_quantity)
);
CREATE INDEX IF NOT EXISTS idx_components_category ON components(category);
CREATE INDEX IF NOT EXISTS idx_components_name ON components(name);

CREATE TABLE IF NOT EXISTS transactions (
  id                TEXT PRIMARY KEY,
  code              TEXT NOT NULL UNIQUE,
  student_id        TEXT NOT NULL REFERENCES students(id),
  component_id      TEXT NOT NULL REFERENCES components(id),
  quantity          INTEGER NOT NULL CHECK (quantity > 0),
  quantity_returned INTEGER NOT NULL DEFAULT 0 CHECK (quantity_returned >= 0),
  quantity_lost     INTEGER NOT NULL DEFAULT 0 CHECK (quantity_lost >= 0),
  status            TEXT NOT NULL DEFAULT 'issued' CHECK (status IN ('issued','partially_returned','returned','lost')),
  issued_by         TEXT REFERENCES users(id),
  issued_at         TEXT NOT NULL,
  due_at            TEXT NOT NULL,
  returned_at       TEXT,
  notes             TEXT,
  created_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  CHECK (quantity_returned + quantity_lost <= quantity)
);
CREATE INDEX IF NOT EXISTS idx_tx_status ON transactions(status);
CREATE INDEX IF NOT EXISTS idx_tx_student ON transactions(student_id);
CREATE INDEX IF NOT EXISTS idx_tx_component ON transactions(component_id);
CREATE INDEX IF NOT EXISTS idx_tx_due ON transactions(due_at);
CREATE INDEX IF NOT EXISTS idx_tx_issued_at ON transactions(issued_at);

CREATE TABLE IF NOT EXISTS transaction_events (
  id             TEXT PRIMARY KEY,
  transaction_id TEXT NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
  type           TEXT NOT NULL CHECK (type IN ('issued','returned','lost','adjusted')),
  quantity       INTEGER NOT NULL DEFAULT 0,
  condition      TEXT,
  notes          TEXT,
  actor_id       TEXT REFERENCES users(id),
  created_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_tx_events_tx ON transaction_events(transaction_id);

CREATE TABLE IF NOT EXISTS audit_logs (
  id             TEXT PRIMARY KEY,
  actor_id       TEXT,
  actor_username TEXT,
  action         TEXT NOT NULL,
  entity_type    TEXT NOT NULL,
  entity_id      TEXT,
  before_json    TEXT,
  after_json     TEXT,
  ip             TEXT,
  user_agent     TEXT,
  created_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_logs(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_actor ON audit_logs(actor_id);
