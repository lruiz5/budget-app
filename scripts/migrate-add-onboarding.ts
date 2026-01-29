import Database from 'better-sqlite3';

const sqlite = new Database('budget.db');

// Create the user_onboarding table
sqlite.exec(`
  CREATE TABLE IF NOT EXISTS user_onboarding (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL UNIQUE,
    current_step INTEGER NOT NULL DEFAULT 1,
    completed_at INTEGER,
    skipped_at INTEGER,
    created_at INTEGER NOT NULL
  )
`);

console.log('Created user_onboarding table');

// Mark existing users (who already have budgets) as onboarding completed
const existingUsers = sqlite.prepare(`
  SELECT DISTINCT user_id FROM budgets WHERE user_id != ''
`).all() as Array<{ user_id: string }>;

const insertStmt = sqlite.prepare(`
  INSERT OR IGNORE INTO user_onboarding (user_id, current_step, completed_at, created_at)
  VALUES (?, 6, ?, ?)
`);

const now = Date.now();
let count = 0;

for (const row of existingUsers) {
  const result = insertStmt.run(row.user_id, now, now);
  if (result.changes > 0) count++;
}

console.log(`Marked ${count} existing user(s) as onboarding complete`);
console.log('Migration complete!');
