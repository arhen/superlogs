import { Database } from 'bun:sqlite';
import path from 'path';
import fs from 'fs';

const DB_PATH = process.env.DB_PATH || path.join(process.cwd(), 'data', 'supervisor-logs.db');

const dataDir = path.dirname(DB_PATH);
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

export const db = new Database(DB_PATH);
db.exec('PRAGMA foreign_keys = ON');

// Initialize database schema first
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT,
    environment TEXT NOT NULL CHECK (environment IN ('local', 'development', 'staging', 'production')),
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS supervisors (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    config_path TEXT NOT NULL,
    log_path TEXT NOT NULL,
    error_log_path TEXT,
    log_template TEXT DEFAULT 'default',
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS config (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL,
    expires_at TEXT NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_supervisors_project_id ON supervisors(project_id);
  CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
  CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at);
`);

// Migration: Add log_template column if it doesn't exist
try {
  db.exec(`ALTER TABLE supervisors ADD COLUMN log_template TEXT DEFAULT 'default'`);
} catch {
  // Column already exists, ignore
}

// No default user - use `bun run create-user` to create users after deployment

export interface User {
  id: number;
  username: string;
  password_hash: string;
  created_at: string;
  updated_at: string;
}

export interface Project {
  id: number;
  name: string;
  description: string | null;
  environment: 'local' | 'development' | 'staging' | 'production';
  created_at: string;
  updated_at: string;
}

export type LogTemplate = 'default' | 'laravel' | 'fastapi';

export interface Supervisor {
  id: number;
  project_id: number;
  name: string;
  config_path: string;
  log_path: string;
  error_log_path: string | null;
  log_template: LogTemplate;
  created_at: string;
  updated_at: string;
}

export interface Session {
  id: string;
  user_id: number;
  expires_at: string;
  created_at: string;
}

// Now we can safely prepare queries since tables exist
export const userQueries = {
  getByUsername: db.query<User, [string]>('SELECT * FROM users WHERE username = ?'),
  getById: db.query<User, [number]>('SELECT * FROM users WHERE id = ?'),
  create: db.query<void, [string, string]>('INSERT INTO users (username, password_hash) VALUES (?, ?)'),
  updatePassword: db.query<void, [string, number]>('UPDATE users SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'),
};

export const projectQueries = {
  getAll: db.query<Project, []>('SELECT * FROM projects ORDER BY name'),
  getById: db.query<Project, [number]>('SELECT * FROM projects WHERE id = ?'),
  create: db.query<void, [string, string | null, string]>('INSERT INTO projects (name, description, environment) VALUES (?, ?, ?)'),
  update: db.query<void, [string, string | null, string, number]>('UPDATE projects SET name = ?, description = ?, environment = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'),
  delete: db.query<void, [number]>('DELETE FROM projects WHERE id = ?'),
};

export const supervisorQueries = {
  getAll: db.query<Supervisor, []>('SELECT * FROM supervisors ORDER BY name'),
  getByProjectId: db.query<Supervisor, [number]>('SELECT * FROM supervisors WHERE project_id = ?'),
  getById: db.query<Supervisor, [number]>('SELECT * FROM supervisors WHERE id = ?'),
  create: db.query<void, [number, string, string, string, string | null, string]>('INSERT INTO supervisors (project_id, name, config_path, log_path, error_log_path, log_template) VALUES (?, ?, ?, ?, ?, ?)'),
  update: db.query<void, [string, string, string, string | null, string, number]>('UPDATE supervisors SET name = ?, config_path = ?, log_path = ?, error_log_path = ?, log_template = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'),
  delete: db.query<void, [number]>('DELETE FROM supervisors WHERE id = ?'),
};

export const sessionQueries = {
  getById: db.query<Session, [string]>('SELECT * FROM sessions WHERE id = ?'),
  getValidById: db.query<Session, [string]>('SELECT * FROM sessions WHERE id = ? AND expires_at > datetime("now")'),
  create: db.query<void, [string, number, string]>('INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)'),
  delete: db.query<void, [string]>('DELETE FROM sessions WHERE id = ?'),
  deleteExpired: db.query<void, []>('DELETE FROM sessions WHERE expires_at <= datetime("now")'),
  deleteByUserId: db.query<void, [number]>('DELETE FROM sessions WHERE user_id = ?'),
};

export const configQueries = {
  get: db.query<{ key: string; value: string }, [string]>('SELECT * FROM config WHERE key = ?'),
  set: db.query<void, [string, string]>('INSERT OR REPLACE INTO config (key, value) VALUES (?, ?)'),
  delete: db.query<void, [string]>('DELETE FROM config WHERE key = ?'),
};
