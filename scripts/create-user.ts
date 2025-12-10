#!/usr/bin/env bun
/**
 * CLI script to create a user for superlogs
 * 
 * Usage:
 *   bun run create-user                    # Interactive prompts
 *   bun run create-user admin password123  # Direct args
 * 
 * In Docker:
 *   docker exec -it superlogs bun run create-user admin password123
 */

import { Database } from 'bun:sqlite';
import bcrypt from 'bcryptjs';
import path from 'path';
import fs from 'fs';

const DB_PATH = process.env.DB_PATH || path.join(process.cwd(), 'data', 'supervisor-logs.db');

// Ensure data directory exists
const dataDir = path.dirname(DB_PATH);
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const db = new Database(DB_PATH);

// Initialize users table if not exists
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
  );
`);

async function prompt(question: string, hide = false): Promise<string> {
  process.stdout.write(question);
  
  if (hide) {
    // For password input, we need to handle it differently
    const stdin = Bun.stdin.stream();
    const reader = stdin.getReader();
    let input = '';
    
    // Disable echo for password
    try {
      const { execSync } = await import('child_process');
      execSync('stty -echo', { stdio: 'inherit' });
    } catch {
      // Ignore if stty not available
    }
    
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      const text = new TextDecoder().decode(value);
      if (text.includes('\n')) {
        input += text.split('\n')[0];
        break;
      }
      input += text;
    }
    
    try {
      const { execSync } = await import('child_process');
      execSync('stty echo', { stdio: 'inherit' });
    } catch {
      // Ignore if stty not available
    }
    
    console.log(); // New line after hidden input
    reader.releaseLock();
    return input.trim();
  }
  
  // Normal input
  for await (const line of console) {
    return line.trim();
  }
  return '';
}

async function main() {
  let username = process.argv[2];
  let password = process.argv[3];

  console.log('\n┌─────────────────────────────────────┐');
  console.log('│     superlogs - create user         │');
  console.log('└─────────────────────────────────────┘\n');

  // Get username if not provided
  if (!username) {
    username = await prompt('username: ');
  }

  if (!username) {
    console.error('error: username is required');
    process.exit(1);
  }

  // Check if user already exists
  const existingUser = db.query('SELECT id FROM users WHERE username = ?').get(username);
  if (existingUser) {
    console.error(`error: user "${username}" already exists`);
    process.exit(1);
  }

  // Get password if not provided
  if (!password) {
    password = await prompt('password: ', true);
    if (!password) {
      console.error('error: password is required');
      process.exit(1);
    }
    
    const confirmPassword = await prompt('confirm password: ', true);
    if (password !== confirmPassword) {
      console.error('error: passwords do not match');
      process.exit(1);
    }
  }

  if (password.length < 4) {
    console.error('error: password must be at least 4 characters');
    process.exit(1);
  }

  // Create user
  const passwordHash = bcrypt.hashSync(password, 10);
  db.query('INSERT INTO users (username, password_hash) VALUES (?, ?)').run(username, passwordHash);

  console.log(`\n✓ user "${username}" created successfully\n`);
  
  db.close();
  process.exit(0);
}

main().catch((err) => {
  console.error('error:', err.message);
  process.exit(1);
});
