/**
 * Shared schema SQL for creating tables.
 * Used by both local PGlite initialization and Supabase setup-schema endpoint.
 */

/** Get the CREATE TABLE SQL for all budget app tables */
export function getSchemaSQL(): string {
  return `
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
      category_order INTEGER NOT NULL DEFAULT 0,
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      deleted_at TIMESTAMPTZ
    );

    -- Linked accounts table
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
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      deleted_at TIMESTAMPTZ
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
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      deleted_at TIMESTAMPTZ
    );

    -- Budget items table
    CREATE TABLE IF NOT EXISTS budget_items (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      category_id UUID NOT NULL REFERENCES budget_categories(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      planned NUMERIC(10, 2) NOT NULL DEFAULT '0',
      "order" INTEGER NOT NULL DEFAULT 0,
      recurring_payment_id UUID,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      deleted_at TIMESTAMPTZ
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
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    -- Split transactions table
    CREATE TABLE IF NOT EXISTS split_transactions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      parent_transaction_id UUID NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
      budget_item_id UUID NOT NULL REFERENCES budget_items(id) ON DELETE CASCADE,
      amount NUMERIC(10, 2) NOT NULL,
      description TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      deleted_at TIMESTAMPTZ
    );

    -- User onboarding table
    CREATE TABLE IF NOT EXISTS user_onboarding (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id TEXT NOT NULL UNIQUE,
      current_step INTEGER NOT NULL DEFAULT 1,
      completed_at TIMESTAMPTZ,
      skipped_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      deleted_at TIMESTAMPTZ
    );

    -- CSV import hashes table
    CREATE TABLE IF NOT EXISTS csv_import_hashes (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      linked_account_id UUID NOT NULL REFERENCES linked_accounts(id) ON DELETE CASCADE,
      hash TEXT NOT NULL,
      transaction_id UUID REFERENCES transactions(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    -- Income allocations table
    CREATE TABLE IF NOT EXISTS income_allocations (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id TEXT NOT NULL DEFAULT '',
      income_item_name TEXT NOT NULL,
      target_category_type TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );
  `;
}
