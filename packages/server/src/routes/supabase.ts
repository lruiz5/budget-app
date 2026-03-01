import { Hono } from 'hono';
import {
  loadSupabaseConfig,
  saveSupabaseConfig,
  isSupabaseEnabled,
  maskKey,
} from '@budget-app/shared/db/supabase-config';
import {
  testSupabaseConnection,
  resetSupabaseConnection,
  getSupabaseSQL,
} from '@budget-app/shared/db/supabase-client';
import { getSyncStatus, triggerSync, restartSyncScheduler, startSyncScheduler, stopSyncScheduler } from '@budget-app/shared/db/sync-scheduler';
import { getPendingChanges, getPendingCount, type ChangelogEntry } from '@budget-app/shared/db/sync-changelog';
import { runInitialSync } from '@budget-app/shared/db/sync-engine';
import { getLocalDb } from '@budget-app/shared/db/local';
import type { AppEnv } from '../types';

const route = new Hono<AppEnv>();

// GET /config - Get Supabase configuration (masked)
route.get('/config', async (c) => {
  const config = loadSupabaseConfig();
  if (!config) {
    return c.json({ enabled: false, databaseUrl: '', lastSyncAt: null, instanceId: '' });
  }

  return c.json({
    enabled: config.enabled,
    databaseUrl: maskKey(config.databaseUrl),
    lastSyncAt: config.lastSyncAt,
    instanceId: config.instanceId,
  });
});

// PUT /config - Update Supabase configuration
route.put('/config', async (c) => {
  const body = await c.req.json();
  const { databaseUrl, enabled } = body;

  const updates: Record<string, unknown> = {};

  if (typeof databaseUrl === 'string' && !databaseUrl.includes('...')) {
    updates.databaseUrl = databaseUrl;
  }

  if (typeof enabled === 'boolean') {
    updates.enabled = enabled;
  }

  const config = saveSupabaseConfig(updates);

  // Reset connection when config changes
  await resetSupabaseConnection();

  // Restart scheduler based on new config
  if (isSupabaseEnabled()) {
    restartSyncScheduler();
  } else {
    stopSyncScheduler();
  }

  return c.json({
    enabled: config.enabled,
    databaseUrl: maskKey(config.databaseUrl),
    lastSyncAt: config.lastSyncAt,
    instanceId: config.instanceId,
  });
});

// POST /test-connection - Test the Supabase connection
route.post('/test-connection', async (c) => {
  const result = await testSupabaseConnection();
  return c.json(result);
});

// POST /setup-schema - Create tables on Supabase
route.post('/setup-schema', async (c) => {
  try {
    const sql = getSupabaseSQL();

    await sql.unsafe(`
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
    `);

    return c.json({ success: true, message: 'Schema created/verified on Supabase' });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return c.json({ success: false, message }, 500);
  }
});

// GET /status - Get sync status
route.get('/status', async (c) => {
  const config = loadSupabaseConfig();
  const syncStatus = getSyncStatus();

  return c.json({
    ...syncStatus,
    enabled: config?.enabled ?? false,
    lastSyncAt: config?.lastSyncAt ?? null,
    instanceId: config?.instanceId ?? '',
  });
});

// GET /changelog - Get pending/errored changelog entries
route.get('/changelog', async (c) => {
  try {
    const entries = await getPendingChanges();
    const pendingCount = await getPendingCount();
    return c.json({ entries, pendingCount });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return c.json({ entries: [], pendingCount: 0, error: message });
  }
});

// GET /audit - Find conflicts between local and remote
route.get('/audit', async (c) => {
  try {
    if (!isSupabaseEnabled()) {
      return c.json({ conflicts: [], message: 'Supabase sync is not enabled' });
    }

    const sql = getSupabaseSQL();
    const localDb = await getLocalDb();
    const localClient = (localDb as any)._.session.client;

    const entries = await getPendingChanges();
    const conflicts: Array<{
      table: string;
      recordId: string;
      localData: Record<string, unknown> | null;
      remoteData: Record<string, unknown> | null;
      changelogId: number;
    }> = [];

    // Check errored entries for conflicts
    const erroredEntries = entries.filter((e: ChangelogEntry) => e.error_message);

    for (const entry of erroredEntries) {
      const localRow = await localClient.query(
        `SELECT * FROM ${entry.table_name} WHERE id = $1`,
        [entry.record_id]
      );

      let remoteRow = null;
      try {
        const result = await sql`
          SELECT * FROM ${sql(entry.table_name)} WHERE id = ${entry.record_id}
        `;
        remoteRow = result.length > 0 ? result[0] : null;
      } catch {
        // Remote table or record may not exist
      }

      conflicts.push({
        table: entry.table_name,
        recordId: entry.record_id,
        localData: localRow.rows.length > 0 ? localRow.rows[0] : null,
        remoteData: remoteRow,
        changelogId: entry.id,
      });
    }

    return c.json({ conflicts });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return c.json({ conflicts: [], error: message }, 500);
  }
});

// POST /resolve-conflict - Resolve a sync conflict
route.post('/resolve-conflict', async (c) => {
  try {
    const body = await c.req.json();
    const { changelogId, strategy } = body;

    if (!changelogId || !['keep-local', 'use-remote', 'discard'].includes(strategy)) {
      return c.json({ error: 'Invalid parameters. Need changelogId and strategy (keep-local|use-remote|discard)' }, 400);
    }

    const localDb = await getLocalDb();
    const localClient = (localDb as any)._.session.client;

    if (strategy === 'discard') {
      // Mark the changelog entry as synced (discard the change)
      await localClient.query(
        `UPDATE sync_changelog SET synced = true, error_message = NULL WHERE id = $1`,
        [changelogId]
      );
      return c.json({ success: true, message: 'Change discarded' });
    }

    if (strategy === 'use-remote') {
      // Get the changelog entry to find the table and record
      const entryResult = await localClient.query(
        `SELECT * FROM sync_changelog WHERE id = $1`,
        [changelogId]
      );
      if (entryResult.rows.length === 0) {
        return c.json({ error: 'Changelog entry not found' }, 404);
      }

      const entry = entryResult.rows[0];
      const sql = getSupabaseSQL();

      // Fetch remote record
      const remoteRows = await sql`
        SELECT * FROM ${sql(entry.table_name)} WHERE id = ${entry.record_id}
      `;

      if (remoteRows.length > 0) {
        const remoteRecord = remoteRows[0];
        const columns = Object.keys(remoteRecord);
        const values = columns.map(col => remoteRecord[col]);
        const placeholders = columns.map((_, i) => `$${i + 1}`).join(', ');
        const updateParts = columns.filter(c => c !== 'id').map((col, i) => `${col} = $${columns.indexOf(col) + 1}`).join(', ');

        const upsertSQL = `
          INSERT INTO ${entry.table_name} (${columns.join(', ')})
          VALUES (${placeholders})
          ON CONFLICT (id) DO UPDATE SET ${updateParts}
        `;

        await localClient.transaction(async (tx: any) => {
          await tx.query("SET LOCAL app.syncing = 'true'");
          await tx.query(upsertSQL, values);
        });
      }

      // Mark as synced
      await localClient.query(
        `UPDATE sync_changelog SET synced = true, error_message = NULL WHERE id = $1`,
        [changelogId]
      );

      return c.json({ success: true, message: 'Used remote version' });
    }

    if (strategy === 'keep-local') {
      // Clear error and retry on next sync cycle
      await localClient.query(
        `UPDATE sync_changelog SET error_message = NULL, last_attempt_at = NULL WHERE id = $1`,
        [changelogId]
      );
      return c.json({ success: true, message: 'Will retry with local version on next sync' });
    }

    return c.json({ error: 'Unknown strategy' }, 400);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return c.json({ success: false, error: message }, 500);
  }
});

// POST /sync - Trigger a manual sync
route.post('/sync', async (c) => {
  try {
    if (!isSupabaseEnabled()) {
      return c.json({ error: 'Supabase sync is not enabled' }, 400);
    }

    const result = await triggerSync();
    return c.json({ success: true, result });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return c.json({ success: false, error: message }, 500);
  }
});

// POST /initial-sync - Run initial sync (first-time setup)
route.post('/initial-sync', async (c) => {
  try {
    const body = await c.req.json();
    const { direction } = body;

    if (!['push', 'pull', 'merge'].includes(direction)) {
      return c.json({ error: 'Invalid direction. Must be push, pull, or merge.' }, 400);
    }

    const result = await runInitialSync(direction);

    // Start the scheduler after initial sync
    if (isSupabaseEnabled()) {
      startSyncScheduler();
    }

    return c.json({ success: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return c.json({ success: false, error: message }, 500);
  }
});

export default route;
