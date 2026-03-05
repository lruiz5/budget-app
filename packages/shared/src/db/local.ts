import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import * as fs from 'fs';
import * as path from 'path';
import * as schema from '../schema';

// PGlite storage location - configurable via environment variable
// - In Node.js (API routes): uses file system
// - In browser (future static build): will use IndexedDB
const DB_PATH = process.env.PGLITE_DB_LOCATION || './data/budget-local';

// Use global state in development to persist across HMR (Hot Module Reload)
// This prevents multiple PGlite instances from being created and corrupting the database
declare global {
  // eslint-disable-next-line no-var
  var __pgliteClient: PGlite | null | undefined;
  // eslint-disable-next-line no-var
  var __localDbInstance: ReturnType<typeof drizzle<typeof schema>> | null | undefined;
  // eslint-disable-next-line no-var
  var __initializationPromise: Promise<ReturnType<typeof drizzle<typeof schema>>> | null | undefined;
  // eslint-disable-next-line no-var
  var __initializationError: Error | null | undefined;
}

// In development, use global state to survive HMR
// In production, use module-level state
const isDev = process.env.NODE_ENV !== 'production';

function getPgliteClient(): PGlite | null {
  return isDev ? (globalThis.__pgliteClient ?? null) : pgliteClient;
}

function setPgliteClient(client: PGlite | null): void {
  if (isDev) {
    globalThis.__pgliteClient = client;
  } else {
    pgliteClient = client;
  }
}

function getLocalDbInstanceInternal(): ReturnType<typeof drizzle<typeof schema>> | null {
  return isDev ? (globalThis.__localDbInstance ?? null) : localDbInstance;
}

function setLocalDbInstance(instance: ReturnType<typeof drizzle<typeof schema>> | null): void {
  if (isDev) {
    globalThis.__localDbInstance = instance;
  } else {
    localDbInstance = instance;
  }
}

function getInitPromise(): Promise<ReturnType<typeof drizzle<typeof schema>>> | null {
  return isDev ? (globalThis.__initializationPromise ?? null) : initializationPromise;
}

function setInitPromise(promise: Promise<ReturnType<typeof drizzle<typeof schema>>> | null): void {
  if (isDev) {
    globalThis.__initializationPromise = promise;
  } else {
    initializationPromise = promise;
  }
}

function getInitError(): Error | null {
  return isDev ? (globalThis.__initializationError ?? null) : initializationError;
}

function setInitError(error: Error | null): void {
  if (isDev) {
    globalThis.__initializationError = error;
  } else {
    initializationError = error;
  }
}

// Track initialization state (module-level for production)
let pgliteClient: PGlite | null = null;
let localDbInstance: ReturnType<typeof drizzle<typeof schema>> | null = null;
let initializationPromise: Promise<ReturnType<typeof drizzle<typeof schema>>> | null = null;
let initializationError: Error | null = null;

/**
 * Ensure the data directory exists.
 */
function ensureDataDirectory(): void {
  const dir = path.dirname(DB_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

/**
 * Check if a PGlite lock file (postmaster.pid) is stale.
 */
function isLockFileStale(lockFilePath: string): boolean {
  if (!fs.existsSync(lockFilePath)) {
    return false;
  }

  try {
    const content = fs.readFileSync(lockFilePath, 'utf-8');
    const lines = content.split('\n');
    const pidLine = lines[0]?.trim();

    if (pidLine === '-42') {
      console.log('Found PGlite lock file with placeholder PID, assuming stale');
      return true;
    }

    const pid = parseInt(pidLine, 10);
    if (!isNaN(pid) && pid > 0) {
      try {
        process.kill(pid, 0);
        return false;
      } catch {
        console.log(`Lock file references non-existent process ${pid}, assuming stale`);
        return true;
      }
    }

    return true;
  } catch (error) {
    console.error('Error checking lock file:', error);
    return true;
  }
}

/**
 * Remove stale PGlite lock files that might be blocking initialization.
 */
function clearStaleLockFile(): boolean {
  const lockFilePath = path.join(DB_PATH, 'postmaster.pid');

  if (!fs.existsSync(lockFilePath)) {
    return false;
  }

  if (isLockFileStale(lockFilePath)) {
    try {
      fs.unlinkSync(lockFilePath);
      console.log(`Removed stale lock file: ${lockFilePath}`);
      return true;
    } catch (error) {
      console.error('Failed to remove stale lock file:', error);
      return false;
    }
  }

  return false;
}

/**
 * Create a backup of the database directory.
 */
export function createBackup(): string | null {
  if (!fs.existsSync(DB_PATH)) {
    return null;
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = `${DB_PATH}-backup-${timestamp}`;

  try {
    fs.cpSync(DB_PATH, backupPath, { recursive: true });
    console.log(`Database backup created at: ${backupPath}`);
    return backupPath;
  } catch (error) {
    console.error('Failed to create database backup:', error);
    return null;
  }
}

/**
 * Internal initialization function - only called once.
 */
async function initializeLocalDb(): Promise<ReturnType<typeof drizzle<typeof schema>>> {
  ensureDataDirectory();
  clearStaleLockFile();

  let client: PGlite;
  try {
    client = new PGlite(DB_PATH);
    await client.waitReady;
    setPgliteClient(client);
  } catch (error) {
    const backupPath = createBackup();
    const errorMessage = error instanceof Error ? error.message : String(error);
    const fullError = new Error(
      `PGlite database initialization failed. Your data has NOT been deleted.\n` +
      `Database location: ${DB_PATH}\n` +
      (backupPath ? `Backup created at: ${backupPath}\n` : '') +
      `Original error: ${errorMessage}\n\n` +
      `Possible solutions:\n` +
      `1. Check if another process is using the database\n` +
      `2. Verify the database directory has correct permissions\n` +
      `3. If the database is corrupted, you can manually delete ${DB_PATH} to start fresh\n` +
      `4. Set PGLITE_DB_LOCATION in .env to use a different location`
    );

    setInitError(fullError);
    setPgliteClient(null);
    throw fullError;
  }

  const db = drizzle(client, { schema });

  try {
    await initializeSchema(client);
  } catch (schemaError) {
    const errorMessage = schemaError instanceof Error ? schemaError.message : String(schemaError);
    const fullError = new Error(
      `Database schema initialization failed. Your data has NOT been deleted.\n` +
      `Database location: ${DB_PATH}\n` +
      `Original error: ${errorMessage}\n\n` +
      `This may be a migration issue. Please check the console for details.`
    );

    setInitError(fullError);
    await client.close();
    setPgliteClient(null);
    throw fullError;
  }

  setLocalDbInstance(db);
  setInitError(null);
  return db;
}

/**
 * Get the local Drizzle database instance.
 */
export async function getLocalDb() {
  const existingDb = getLocalDbInstanceInternal();
  if (existingDb) {
    return existingDb;
  }

  const existingError = getInitError();
  if (existingError) {
    throw existingError;
  }

  const existingPromise = getInitPromise();
  if (existingPromise) {
    return existingPromise;
  }

  const newPromise = initializeLocalDb();
  setInitPromise(newPromise);

  try {
    return await newPromise;
  } catch (error) {
    setInitPromise(null);
    throw error;
  }
}

/**
 * Get the current database initialization error, if any.
 */
export function getDbInitError(): Error | null {
  return getInitError();
}

/**
 * Get the configured database path.
 */
export function getDbPath(): string {
  return DB_PATH;
}

/**
 * Initialize the database schema.
 */
async function initializeSchema(client: PGlite): Promise<void> {
  await client.exec(`
    -- Budgets table
    CREATE TABLE IF NOT EXISTS budgets (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id TEXT NOT NULL DEFAULT '',
      month INTEGER NOT NULL,
      year INTEGER NOT NULL,
      buffer NUMERIC(10, 2) NOT NULL DEFAULT '0',
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    -- Budget categories table
    CREATE TABLE IF NOT EXISTS budget_categories (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      budget_id UUID NOT NULL REFERENCES budgets(id) ON DELETE CASCADE,
      category_type TEXT NOT NULL,
      name TEXT NOT NULL,
      emoji TEXT,
      category_order INTEGER NOT NULL DEFAULT 0
    );

    -- Linked accounts table (needed before transactions)
    CREATE TABLE IF NOT EXISTS linked_accounts (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id TEXT NOT NULL DEFAULT '',
      account_source TEXT NOT NULL DEFAULT 'teller',
      teller_account_id TEXT UNIQUE,
      teller_enrollment_id TEXT,
      access_token TEXT,
      institution_name TEXT NOT NULL,
      institution_id TEXT,
      account_name TEXT NOT NULL,
      account_type TEXT NOT NULL,
      account_subtype TEXT NOT NULL,
      last_four TEXT,
      status TEXT NOT NULL,
      last_synced_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      csv_column_mapping TEXT,
      current_balance NUMERIC(10, 2),
      available_balance NUMERIC(10, 2),
      credit_limit NUMERIC(10, 2),
      minimum_payment NUMERIC(10, 2),
      payment_due_date TEXT,
      balance_updated_at TIMESTAMPTZ
    );

    -- Recurring payments table
    CREATE TABLE IF NOT EXISTS recurring_payments (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id TEXT NOT NULL DEFAULT '',
      name TEXT NOT NULL,
      amount NUMERIC(10, 2) NOT NULL,
      frequency TEXT NOT NULL,
      next_due_date TEXT NOT NULL,
      funded_amount NUMERIC(10, 2) NOT NULL DEFAULT '0',
      category_type TEXT,
      is_active BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    -- Budget items table
    CREATE TABLE IF NOT EXISTS budget_items (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      category_id UUID NOT NULL REFERENCES budget_categories(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      planned NUMERIC(10, 2) NOT NULL DEFAULT '0',
      "order" INTEGER NOT NULL DEFAULT 0,
      recurring_payment_id UUID,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    -- Transactions table
    CREATE TABLE IF NOT EXISTS transactions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      budget_item_id UUID REFERENCES budget_items(id) ON DELETE SET NULL,
      linked_account_id UUID REFERENCES linked_accounts(id),
      date TEXT NOT NULL,
      description TEXT NOT NULL,
      amount NUMERIC(10, 2) NOT NULL,
      type TEXT NOT NULL,
      merchant TEXT,
      check_number TEXT,
      teller_transaction_id TEXT UNIQUE,
      teller_account_id TEXT,
      status TEXT,
      is_transfer BOOLEAN NOT NULL DEFAULT false,
      transfer_pair_id UUID,
      deleted_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    -- Split transactions table
    CREATE TABLE IF NOT EXISTS split_transactions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      parent_transaction_id UUID NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
      budget_item_id UUID NOT NULL REFERENCES budget_items(id) ON DELETE CASCADE,
      amount NUMERIC(10, 2) NOT NULL,
      description TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    -- User onboarding table
    CREATE TABLE IF NOT EXISTS user_onboarding (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id TEXT NOT NULL UNIQUE,
      current_step INTEGER NOT NULL DEFAULT 1,
      completed_at TIMESTAMPTZ,
      skipped_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    -- CSV import hashes table (for deduplication)
    CREATE TABLE IF NOT EXISTS csv_import_hashes (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      linked_account_id UUID NOT NULL REFERENCES linked_accounts(id) ON DELETE CASCADE,
      hash TEXT NOT NULL,
      transaction_id UUID REFERENCES transactions(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    -- Income allocations table (links income items to expense categories)
    CREATE TABLE IF NOT EXISTS income_allocations (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id TEXT NOT NULL DEFAULT '',
      income_item_name TEXT NOT NULL,
      target_category_type TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);

  await client.exec(`
    ALTER TABLE linked_accounts ADD COLUMN IF NOT EXISTS account_source TEXT NOT NULL DEFAULT 'teller';
    ALTER TABLE linked_accounts ADD COLUMN IF NOT EXISTS csv_column_mapping TEXT;
  `).catch(() => {});

  // Add updatedAt and deletedAt columns for sync support (existing databases)
  const syncColumns = [
    // updatedAt columns
    'ALTER TABLE budget_categories ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW()',
    'ALTER TABLE budget_items ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW()',
    'ALTER TABLE transactions ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW()',
    'ALTER TABLE split_transactions ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW()',
    'ALTER TABLE linked_accounts ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW()',
    'ALTER TABLE user_onboarding ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW()',
    'ALTER TABLE csv_import_hashes ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW()',
    'ALTER TABLE income_allocations ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW()',
    // deletedAt columns (soft delete for sync)
    'ALTER TABLE budget_categories ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ',
    'ALTER TABLE budget_items ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ',
    'ALTER TABLE split_transactions ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ',
    'ALTER TABLE linked_accounts ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ',
    'ALTER TABLE recurring_payments ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ',
    'ALTER TABLE user_onboarding ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ',
  ];
  for (const cmd of syncColumns) {
    await client.exec(cmd).catch(() => {});
  }

  const alterCommands = [
    'ALTER TABLE linked_accounts ALTER COLUMN teller_account_id DROP NOT NULL',
    'ALTER TABLE linked_accounts ALTER COLUMN teller_enrollment_id DROP NOT NULL',
    'ALTER TABLE linked_accounts ALTER COLUMN access_token DROP NOT NULL',
    'ALTER TABLE linked_accounts ALTER COLUMN institution_id DROP NOT NULL',
    'ALTER TABLE linked_accounts ALTER COLUMN last_four DROP NOT NULL',
    // Credit card / transfer fields (for existing databases)
    'ALTER TABLE transactions ADD COLUMN IF NOT EXISTS is_transfer BOOLEAN NOT NULL DEFAULT false',
    'ALTER TABLE transactions ADD COLUMN IF NOT EXISTS transfer_pair_id UUID',
    'ALTER TABLE linked_accounts ADD COLUMN IF NOT EXISTS current_balance NUMERIC(10, 2)',
    'ALTER TABLE linked_accounts ADD COLUMN IF NOT EXISTS available_balance NUMERIC(10, 2)',
    'ALTER TABLE linked_accounts ADD COLUMN IF NOT EXISTS credit_limit NUMERIC(10, 2)',
    'ALTER TABLE linked_accounts ADD COLUMN IF NOT EXISTS minimum_payment NUMERIC(10, 2)',
    'ALTER TABLE linked_accounts ADD COLUMN IF NOT EXISTS payment_due_date TEXT',
    'ALTER TABLE linked_accounts ADD COLUMN IF NOT EXISTS balance_updated_at TIMESTAMPTZ',
  ];
  for (const cmd of alterCommands) {
    await client.exec(cmd).catch(() => {});
  }

  // Sync changelog table and triggers
  await client.exec(`
    CREATE TABLE IF NOT EXISTS sync_changelog (
      id SERIAL PRIMARY KEY,
      table_name TEXT NOT NULL,
      record_id TEXT NOT NULL,
      operation TEXT NOT NULL,
      changed_at TIMESTAMPTZ DEFAULT NOW(),
      synced BOOLEAN DEFAULT false,
      error_message TEXT,
      last_attempt_at TIMESTAMPTZ
    );

    CREATE INDEX IF NOT EXISTS idx_sync_changelog_unsynced
      ON sync_changelog (synced) WHERE synced = false;
  `);

  // Create trigger function that auto-logs changes (skips during sync pulls)
  await client.exec(`
    CREATE OR REPLACE FUNCTION sync_changelog_trigger() RETURNS trigger AS $$
    BEGIN
      IF current_setting('app.syncing', true) = 'true' THEN
        IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
      END IF;

      IF TG_OP = 'DELETE' THEN
        INSERT INTO sync_changelog (table_name, record_id, operation)
        VALUES (TG_TABLE_NAME, OLD.id::text, 'DELETE');
        RETURN OLD;
      ELSE
        INSERT INTO sync_changelog (table_name, record_id, operation)
        VALUES (TG_TABLE_NAME, NEW.id::text, TG_OP);
        RETURN NEW;
      END IF;
    END;
    $$ LANGUAGE plpgsql;
  `);

  // Attach triggers to all synced tables
  const syncedTables = [
    'budgets', 'budget_categories', 'budget_items', 'transactions',
    'split_transactions', 'linked_accounts', 'recurring_payments',
    'user_onboarding', 'csv_import_hashes', 'income_allocations',
  ];

  for (const table of syncedTables) {
    await client.exec(`
      DROP TRIGGER IF EXISTS sync_track_${table} ON ${table};
      CREATE TRIGGER sync_track_${table}
        AFTER INSERT OR UPDATE OR DELETE ON ${table}
        FOR EACH ROW EXECUTE FUNCTION sync_changelog_trigger();
    `).catch(() => {});
  }
}

/**
 * Close the PGlite connection.
 */
export async function closeLocalDb(): Promise<void> {
  const client = getPgliteClient();
  if (client) {
    await client.close();
    setPgliteClient(null);
    setLocalDbInstance(null);
    setInitPromise(null);
  }
}

/**
 * Reset the database initialization error and clear stale lock files.
 */
export function resetDbError(): void {
  setInitError(null);
  setInitPromise(null);
  setLocalDbInstance(null);
  setPgliteClient(null);
  clearStaleLockFile();
}

/**
 * Check if the database is currently initialized and healthy.
 */
export function isDbInitialized(): boolean {
  return getLocalDbInstanceInternal() !== null && getInitError() === null;
}

/**
 * Get database status for debugging/display.
 */
export function getDbStatus(): {
  initialized: boolean;
  hasError: boolean;
  errorMessage: string | null;
  dbPath: string;
} {
  const error = getInitError();
  return {
    initialized: getLocalDbInstanceInternal() !== null,
    hasError: error !== null,
    errorMessage: error?.message || null,
    dbPath: DB_PATH,
  };
}

/**
 * List available database backups.
 */
export function listBackups(): { path: string; timestamp: string }[] {
  const dir = path.dirname(DB_PATH);
  const baseName = path.basename(DB_PATH);

  if (!fs.existsSync(dir)) {
    return [];
  }

  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const backups: { path: string; timestamp: string }[] = [];

  for (const entry of entries) {
    if (entry.isDirectory() && entry.name.startsWith(`${baseName}-backup-`)) {
      const timestamp = entry.name.replace(`${baseName}-backup-`, '');
      backups.push({
        path: path.join(dir, entry.name),
        timestamp,
      });
    }
  }

  backups.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  return backups;
}

/**
 * Delete the local database.
 */
export async function deleteLocalDb(): Promise<string | null> {
  await closeLocalDb();
  const backupPath = createBackup();

  if (!fs.existsSync(DB_PATH)) {
    return backupPath;
  }

  try {
    fs.rmSync(DB_PATH, { recursive: true, force: true });
    console.log(`Database deleted: ${DB_PATH}`);
    resetDbError();
    return backupPath;
  } catch (error) {
    console.error('Failed to delete database:', error);
    throw new Error(`Failed to delete database: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Restore the database from a backup.
 */
export async function restoreFromBackup(backupPath: string): Promise<void> {
  await closeLocalDb();

  if (!fs.existsSync(backupPath)) {
    throw new Error(`Backup not found: ${backupPath}`);
  }

  if (fs.existsSync(DB_PATH)) {
    fs.rmSync(DB_PATH, { recursive: true, force: true });
  }

  try {
    fs.cpSync(backupPath, DB_PATH, { recursive: true });
    console.log(`Database restored from: ${backupPath}`);
    resetDbError();
  } catch (error) {
    console.error('Failed to restore database:', error);
    throw new Error(`Failed to restore database: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Delete a specific backup.
 */
export function deleteBackup(backupPath: string): void {
  if (!fs.existsSync(backupPath)) {
    return;
  }

  const baseName = path.basename(DB_PATH);
  if (!path.basename(backupPath).startsWith(`${baseName}-backup-`)) {
    throw new Error('Invalid backup path');
  }

  fs.rmSync(backupPath, { recursive: true, force: true });
  console.log(`Backup deleted: ${backupPath}`);
}

export { schema };
