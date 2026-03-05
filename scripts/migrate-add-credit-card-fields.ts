/**
 * Migration script: Add credit card / transfer fields
 *
 * Adds new columns to transactions and linked_accounts tables
 * for credit card balance tracking and transfer detection.
 *
 * Run with: npx tsx scripts/migrate-add-credit-card-fields.ts
 *
 * Safe to run multiple times (uses IF NOT EXISTS / conditional checks).
 */

import postgres from 'postgres';
import { config } from 'dotenv';

config({ path: '.env.local' });

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('DATABASE_URL not found in environment');
  process.exit(1);
}

const sql = postgres(DATABASE_URL, { prepare: false });

async function addColumnIfNotExists(
  table: string,
  column: string,
  definition: string
): Promise<boolean> {
  const result = await sql`
    SELECT 1 FROM information_schema.columns
    WHERE table_name = ${table} AND column_name = ${column}
  `;
  if (result.length === 0) {
    await sql.unsafe(`ALTER TABLE "${table}" ADD COLUMN "${column}" ${definition}`);
    console.log(`  Added ${table}.${column}`);
    return true;
  } else {
    console.log(`  ${table}.${column} already exists, skipping`);
    return false;
  }
}

async function migrate() {
  console.log('=== Credit Card Fields Migration ===\n');

  // Transactions table
  console.log('Updating transactions table...');
  await addColumnIfNotExists('transactions', 'is_transfer', 'BOOLEAN NOT NULL DEFAULT false');
  await addColumnIfNotExists('transactions', 'transfer_pair_id', 'UUID');

  // Linked accounts table
  console.log('\nUpdating linked_accounts table...');
  await addColumnIfNotExists('linked_accounts', 'current_balance', 'NUMERIC(10,2)');
  await addColumnIfNotExists('linked_accounts', 'available_balance', 'NUMERIC(10,2)');
  await addColumnIfNotExists('linked_accounts', 'credit_limit', 'NUMERIC(10,2)');
  await addColumnIfNotExists('linked_accounts', 'minimum_payment', 'NUMERIC(10,2)');
  await addColumnIfNotExists('linked_accounts', 'payment_due_date', 'TEXT');
  await addColumnIfNotExists('linked_accounts', 'balance_updated_at', 'TIMESTAMPTZ');

  console.log('\n=== Migration complete ===');
  await sql.end();
}

migrate().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
