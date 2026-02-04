import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import * as fs from 'fs';
import * as path from 'path';
import * as schema from './schema';

// PGlite storage location
// - In Node.js (API routes): uses file system
// - In browser (future static build): will use IndexedDB
const DB_PATH = './data/budget-local';

let pgliteClient: PGlite | null = null;
let localDbInstance: ReturnType<typeof drizzle<typeof schema>> | null = null;

// Promise-based singleton to prevent race conditions during initialization
let initializationPromise: Promise<ReturnType<typeof drizzle<typeof schema>>> | null = null;

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
 * Clear corrupted database files.
 */
function clearDatabaseFiles(): void {
  if (fs.existsSync(DB_PATH)) {
    fs.rmSync(DB_PATH, { recursive: true, force: true });
  }
}

/**
 * Internal initialization function - only called once.
 * If initialization fails (corrupted DB), clears and retries once.
 */
async function initializeLocalDb(): Promise<ReturnType<typeof drizzle<typeof schema>>> {
  ensureDataDirectory();

  try {
    pgliteClient = new PGlite(DB_PATH);
    await pgliteClient.waitReady;
  } catch (error) {
    console.warn('PGlite initialization failed, clearing database and retrying...', error);
    // Clear corrupted database files
    pgliteClient = null;
    clearDatabaseFiles();
    ensureDataDirectory();

    // Retry initialization
    pgliteClient = new PGlite(DB_PATH);
    await pgliteClient.waitReady;
  }

  const db = drizzle(pgliteClient, { schema });

  // Initialize schema on first connection
  await initializeSchema(pgliteClient);

  localDbInstance = db;
  return db;
}

/**
 * Get the local Drizzle database instance.
 * Uses promise-based singleton to handle concurrent requests safely.
 */
export async function getLocalDb() {
  // If already initialized, return immediately
  if (localDbInstance) {
    return localDbInstance;
  }

  // If initialization is in progress, wait for it
  if (initializationPromise) {
    return initializationPromise;
  }

  // Start initialization and store the promise so concurrent callers can wait
  initializationPromise = initializeLocalDb();

  try {
    return await initializationPromise;
  } catch (error) {
    // Reset on failure so retry is possible
    initializationPromise = null;
    throw error;
  }
}

/**
 * Initialize the database schema.
 * Creates tables if they don't exist.
 */
async function initializeSchema(client: PGlite): Promise<void> {
  // Create tables in FK dependency order
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
      csv_column_mapping TEXT
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
  `);

  // Add columns to existing tables if they don't exist (for existing databases)
  // This handles the case where the database was created before these columns were added
  await client.exec(`
    -- Add account_source column if it doesn't exist
    ALTER TABLE linked_accounts ADD COLUMN IF NOT EXISTS account_source TEXT NOT NULL DEFAULT 'teller';
    ALTER TABLE linked_accounts ADD COLUMN IF NOT EXISTS csv_column_mapping TEXT;
  `).catch(() => {
    // Ignore errors if columns already exist
  });

  // Make Teller-specific columns nullable if they aren't already (separate try/catch for each)
  const alterCommands = [
    'ALTER TABLE linked_accounts ALTER COLUMN teller_account_id DROP NOT NULL',
    'ALTER TABLE linked_accounts ALTER COLUMN teller_enrollment_id DROP NOT NULL',
    'ALTER TABLE linked_accounts ALTER COLUMN access_token DROP NOT NULL',
    'ALTER TABLE linked_accounts ALTER COLUMN institution_id DROP NOT NULL',
    'ALTER TABLE linked_accounts ALTER COLUMN last_four DROP NOT NULL',
  ];
  for (const cmd of alterCommands) {
    await client.exec(cmd).catch(() => {
      // Ignore errors if already nullable
    });
  }
}

/**
 * Close the PGlite connection.
 * Call this when shutting down the app.
 */
export async function closeLocalDb(): Promise<void> {
  if (pgliteClient) {
    await pgliteClient.close();
    pgliteClient = null;
    localDbInstance = null;
    initializationPromise = null;
  }
}

// Export schema for use with the database
export { schema };
