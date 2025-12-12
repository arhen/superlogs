import { Database } from 'bun:sqlite';
import path from 'path';
import fs from 'fs';

const DB_PATH = process.env.DB_PATH || path.join(process.cwd(), 'data', 'supervisor-logs.db');

// Ensure data directory exists
const dataDir = path.dirname(DB_PATH);
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

// Database singleton - lazy initialization
let _db: Database | null = null;

function getDb(): Database {
  if (!_db) {
    _db = new Database(DB_PATH);
    _db.exec('PRAGMA foreign_keys = ON');
    initializeSchema(_db);
  }
  return _db;
}

function initializeSchema(db: Database) {
  // Create tables
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
  const tableInfo = db.query<{ name: string }, []>(`PRAGMA table_info(supervisors)`).all();
  const hasLogTemplate = tableInfo.some((col: { name: string }) => col.name === 'log_template');
  if (!hasLogTemplate) {
    db.exec(`ALTER TABLE supervisors ADD COLUMN log_template TEXT DEFAULT 'default'`);
  }
}

// Export db getter to ensure lazy initialization
export function getDatabase(): Database {
  return getDb();
}

// Types
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

// Query helpers - all use lazy db access via getDb()
export const userQueries = {
  get getByUsername() { return getDb().query<User, [string]>('SELECT * FROM users WHERE username = ?'); },
  get getById() { return getDb().query<User, [number]>('SELECT * FROM users WHERE id = ?'); },
  get create() { return getDb().query<void, [string, string]>('INSERT INTO users (username, password_hash) VALUES (?, ?)'); },
  get updatePassword() { return getDb().query<void, [string, number]>('UPDATE users SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'); },
};

export const projectQueries = {
  get getAll() { return getDb().query<Project, []>('SELECT * FROM projects ORDER BY name'); },
  get getById() { return getDb().query<Project, [number]>('SELECT * FROM projects WHERE id = ?'); },
  get create() { return getDb().query<void, [string, string | null, string]>('INSERT INTO projects (name, description, environment) VALUES (?, ?, ?)'); },
  get update() { return getDb().query<void, [string, string | null, string, number]>('UPDATE projects SET name = ?, description = ?, environment = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'); },
  get delete() { return getDb().query<void, [number]>('DELETE FROM projects WHERE id = ?'); },
};

export const supervisorQueries = {
  get getAll() { return getDb().query<Supervisor, []>('SELECT * FROM supervisors ORDER BY name'); },
  get getByProjectId() { return getDb().query<Supervisor, [number]>('SELECT * FROM supervisors WHERE project_id = ?'); },
  get getById() { return getDb().query<Supervisor, [number]>('SELECT * FROM supervisors WHERE id = ?'); },
  get create() { return getDb().query<void, [number, string, string, string, string | null, string]>('INSERT INTO supervisors (project_id, name, config_path, log_path, error_log_path, log_template) VALUES (?, ?, ?, ?, ?, ?)'); },
  get update() { return getDb().query<void, [string, string, string, string | null, string, number]>('UPDATE supervisors SET name = ?, config_path = ?, log_path = ?, error_log_path = ?, log_template = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'); },
  get delete() { return getDb().query<void, [number]>('DELETE FROM supervisors WHERE id = ?'); },
};

export const sessionQueries = {
  get getById() { return getDb().query<Session, [string]>('SELECT * FROM sessions WHERE id = ?'); },
  get getValidById() { return getDb().query<Session, [string]>('SELECT * FROM sessions WHERE id = ? AND expires_at > datetime("now")'); },
  get create() { return getDb().query<void, [string, number, string]>('INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)'); },
  get delete() { return getDb().query<void, [string]>('DELETE FROM sessions WHERE id = ?'); },
  get deleteExpired() { return getDb().query<void, []>('DELETE FROM sessions WHERE expires_at <= datetime("now")'); },
  get deleteByUserId() { return getDb().query<void, [number]>('DELETE FROM sessions WHERE user_id = ?'); },
};

export const configQueries = {
  get get() { return getDb().query<{ key: string; value: string }, [string]>('SELECT * FROM config WHERE key = ?'); },
  get set() { return getDb().query<void, [string, string]>('INSERT OR REPLACE INTO config (key, value) VALUES (?, ?)'); },
  get delete() { return getDb().query<void, [string]>('DELETE FROM config WHERE key = ?'); },
};
