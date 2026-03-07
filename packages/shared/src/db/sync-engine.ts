import { getLocalDb } from './local';
import { getSupabaseSQL } from './supabase-client';
import type postgres from 'postgres';
import { loadSupabaseConfig, saveSupabaseConfig } from './supabase-config';
import { getPendingChanges, markSynced, markSyncError, clearSyncedEntries, clearAllChangelogEntries } from './sync-changelog';
import type { ChangelogEntry } from './sync-changelog';

/**
 * Tables in dependency order (parents before children).
 * Used for push (upsert parents first) and pull.
 */
const SYNC_TABLE_ORDER = [
  'budgets',
  'budget_categories',
  'linked_accounts',
  'recurring_payments',
  'budget_items',
  'transactions',
  'split_transactions',
  'user_onboarding',
  'csv_import_hashes',
  'income_allocations',
] as const;

/**
 * FK dependency map: child_table -> { fk_column -> parent_table }
 * Used to auto-push missing parent records when FK constraints fail.
 */
const FK_DEPENDENCIES: Record<string, Record<string, string>> = {
  budget_categories: { budget_id: 'budgets' },
  budget_items: { category_id: 'budget_categories', recurring_payment_id: 'recurring_payments' },
  transactions: { budget_item_id: 'budget_items', linked_account_id: 'linked_accounts' },
  split_transactions: { parent_transaction_id: 'transactions', budget_item_id: 'budget_items' },
  csv_import_hashes: { linked_account_id: 'linked_accounts' },
};

/** Column definitions for each table (must match schema.ts exactly) */
function getTableColumns(tableName: string): string[] {
  const columnMap: Record<string, string[]> = {
    budgets: ['id', 'user_id', 'month', 'year', 'buffer', 'created_at', 'updated_at'],
    budget_categories: ['id', 'budget_id', 'category_type', 'name', 'emoji', 'category_order', 'updated_at', 'deleted_at'],
    budget_items: ['id', 'category_id', 'name', 'planned', 'order', 'recurring_payment_id', 'created_at', 'updated_at', 'deleted_at'],
    transactions: ['id', 'budget_item_id', 'linked_account_id', 'date', 'description', 'amount', 'type', 'merchant', 'check_number', 'teller_transaction_id', 'teller_account_id', 'status', 'is_transfer', 'transfer_pair_id', 'deleted_at', 'created_at', 'updated_at'],
    split_transactions: ['id', 'parent_transaction_id', 'budget_item_id', 'amount', 'description', 'created_at', 'updated_at', 'deleted_at'],
    linked_accounts: ['id', 'user_id', 'account_source', 'teller_account_id', 'teller_enrollment_id', 'access_token', 'institution_name', 'institution_id', 'account_name', 'account_type', 'account_subtype', 'last_four', 'status', 'last_synced_at', 'created_at', 'csv_column_mapping', 'current_balance', 'available_balance', 'credit_limit', 'minimum_payment', 'payment_due_date', 'balance_updated_at', 'updated_at', 'deleted_at'],
    recurring_payments: ['id', 'user_id', 'name', 'amount', 'frequency', 'next_due_date', 'funded_amount', 'category_type', 'is_active', 'created_at', 'updated_at', 'deleted_at'],
    user_onboarding: ['id', 'user_id', 'current_step', 'completed_at', 'skipped_at', 'created_at', 'updated_at', 'deleted_at'],
    csv_import_hashes: ['id', 'linked_account_id', 'hash', 'transaction_id', 'created_at', 'updated_at'],
    income_allocations: ['id', 'user_id', 'income_item_name', 'target_category_type', 'created_at', 'updated_at'],
  };
  return columnMap[tableName] || [];
}

// ============================================================================
// PUSH: Local -> Supabase
// ============================================================================

/** Push pending local changes to Supabase */
export async function pushChanges(): Promise<{ pushed: number; skipped: number; errors: { message: string; entry: ChangelogEntry }[] }> {
  const pending = await getPendingChanges();
  if (pending.length === 0) return { pushed: 0, skipped: 0, errors: [] };

  const sql = getSupabaseSQL();
  const localDb = await getLocalDb();
  const localClient = (localDb as any)._.session.client;

  // Deduplicate: keep latest operation per record
  const latestUpsertMap = new Map<string, ChangelogEntry>();
  const deleteMap = new Map<string, ChangelogEntry>();

  for (const entry of pending) {
    const key = `${entry.table_name}:${entry.record_id}`;
    if (entry.operation === 'DELETE') {
      deleteMap.set(key, entry);
      latestUpsertMap.delete(key);
    } else {
      latestUpsertMap.set(key, entry);
    }
  }

  const tableOrderIndex: Map<string, number> = new Map(SYNC_TABLE_ORDER.map((t, i) => [t, i]));

  // Sort upserts by dependency order (parents first)
  const finalUpserts = Array.from(latestUpsertMap.values()).sort((a, b) => {
    return (tableOrderIndex.get(a.table_name) ?? 999) - (tableOrderIndex.get(b.table_name) ?? 999);
  });

  // Sort deletes by reverse dependency order (children first)
  const finalDeletes = Array.from(deleteMap.values()).sort((a, b) => {
    return (tableOrderIndex.get(b.table_name) ?? 999) - (tableOrderIndex.get(a.table_name) ?? 999);
  });

  const orderedEntries = [...finalUpserts, ...finalDeletes];
  let pushed = 0;
  let skipped = 0;
  const errors: { message: string; entry: ChangelogEntry }[] = [];
  const successfulIds: number[] = [];

  for (const entry of orderedEntries) {
    let localRecord: Record<string, any> | null = null;
    try {
      if (entry.operation === 'DELETE') {
        // All our synced tables use soft deletes (deleted_at), so a DELETE trigger
        // means the record was soft-deleted. Push the updated record with deleted_at set.
        const columns = getTableColumns(entry.table_name);
        if (columns.includes('deleted_at')) {
          const localRow = await localClient.query(
            `SELECT * FROM ${q(entry.table_name)} WHERE id = $1`,
            [entry.record_id]
          );
          if (localRow.rows.length > 0) {
            await upsertToRemote(sql, entry.table_name, localRow.rows[0]);
            pushed++;
          }
        }
        successfulIds.push(entry.id);
        continue;
      }

      // INSERT or UPDATE: fetch local record
      const localRow = await localClient.query(
        `SELECT * FROM ${q(entry.table_name)} WHERE id = $1`,
        [entry.record_id]
      );

      if (localRow.rows.length === 0) {
        skipped++;
        successfulIds.push(entry.id);
        continue;
      }

      localRecord = localRow.rows[0];

      // Conflict resolution: check if remote is newer
      const columns = getTableColumns(entry.table_name);
      if (columns.includes('updated_at') && localRecord!.updated_at) {
        const remoteResult = await sql`
          SELECT updated_at FROM ${sql(entry.table_name)} WHERE id = ${entry.record_id}
        `;

        if (remoteResult.length > 0 && remoteResult[0].updated_at) {
          const remoteUpdatedAt = new Date(remoteResult[0].updated_at);
          const localUpdatedAt = new Date(localRecord!.updated_at);
          if (remoteUpdatedAt >= localUpdatedAt) {
            skipped++;
            successfulIds.push(entry.id);
            continue;
          }
        }
      }

      await upsertToRemote(sql, entry.table_name, localRecord!);
      pushed++;
      successfulIds.push(entry.id);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const isFkViolation = message.includes('violates foreign key constraint');

      // Auto-resolve FK violations by pushing missing parent records
      if (isFkViolation && localRecord) {
        console.warn(`[Sync Push] FK violation for ${entry.table_name}:${entry.record_id}, attempting to push missing parent(s)...`);
        const resolved = await tryPushMissingParents(sql, localClient, entry.table_name, localRecord);
        if (resolved) {
          try {
            await upsertToRemote(sql, entry.table_name, localRecord);
            pushed++;
            successfulIds.push(entry.id);
            console.log(`[Sync Push] Retry succeeded for ${entry.table_name}:${entry.record_id} after pushing parent(s)`);
            continue;
          } catch (retryError) {
            const retryMsg = retryError instanceof Error ? retryError.message : String(retryError);
            console.error(`[Sync Push] Retry failed for ${entry.table_name}:${entry.record_id}: ${retryMsg}`);
          }
        }
      }

      const stack = error instanceof Error ? error.stack : undefined;
      console.error(`[Sync Push] ${entry.table_name}:${entry.record_id}: ${message}`);
      if (stack) console.error(`  Stack: ${stack}`);
      await markSyncError(entry.id, message);
      errors.push({ message: `[${entry.table_name}] ${message}`, entry });
      skipped++;
    }
  }

  if (successfulIds.length > 0) {
    await markSynced(successfulIds);
  }

  return { pushed, skipped, errors };
}

// ============================================================================
// PULL: Supabase -> Local
// ============================================================================

/** Pull remote changes from Supabase into local PGlite */
export async function pullChanges(): Promise<{ pulled: number; skipped: number; errors: { message: string; recordId: string }[] }> {
  const config = loadSupabaseConfig();
  if (!config) return { pulled: 0, skipped: 0, errors: [] };

  const sql = getSupabaseSQL();
  const localDb = await getLocalDb();
  const localClient = (localDb as any)._.session.client;

  const lastSyncAt = config.lastSyncAt ? new Date(config.lastSyncAt) : new Date(0);
  let pulled = 0;
  let skipped = 0;
  const errors: { message: string; recordId: string }[] = [];

  for (const tableName of SYNC_TABLE_ORDER) {
    const columns = getTableColumns(tableName);
    if (columns.length === 0) continue;

    // All tables have updated_at after Phase 1 migration
    const timestampCol = columns.includes('updated_at') ? 'updated_at' : 'created_at';

    // Fetch records modified since last sync
    const remoteRows = await sql`
      SELECT * FROM ${sql(tableName)}
      WHERE ${sql(timestampCol)} > ${lastSyncAt.toISOString()}
      ORDER BY ${sql(timestampCol)} ASC
    `;

    for (const remoteRecord of remoteRows) {
      try {
        // Check if local has a newer version
        if (columns.includes('updated_at') && remoteRecord.updated_at) {
          const localRow = await localClient.query(
            `SELECT "updated_at" FROM ${q(tableName)} WHERE id = $1`,
            [remoteRecord.id]
          );

          if (localRow.rows.length > 0 && localRow.rows[0].updated_at) {
            const localUpdatedAt = new Date(localRow.rows[0].updated_at);
            const remoteUpdatedAt = new Date(remoteRecord.updated_at);
            if (localUpdatedAt > remoteUpdatedAt) {
              skipped++;
              continue;
            }
          }
        }

        await upsertToLocal(localClient, tableName, remoteRecord, columns);
        pulled++;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const stack = error instanceof Error ? error.stack : undefined;
        console.error(`[Sync Pull] ${tableName}:${remoteRecord.id}: ${message}`);
        if (stack) console.error(`  Stack: ${stack}`);
        errors.push({ message: `[${tableName}] ${message}`, recordId: remoteRecord.id });
        skipped++;
      }
    }
  }

  // Update lastSyncAt
  saveSupabaseConfig({ lastSyncAt: new Date().toISOString() });

  // Housekeeping
  await clearSyncedEntries();

  return { pulled, skipped, errors };
}

// ============================================================================
// FULL SYNC CYCLE
// ============================================================================

export interface SyncCycleResult {
  pushed: number;
  pulled: number;
  skippedPush: number;
  skippedPull: number;
  pushErrors: number;
  pullErrors: number;
  pushErrorDetails: string[];
  pullErrorDetails: string[];
}

/** Run a complete sync cycle: push local changes, then pull remote changes */
export async function runSyncCycle(): Promise<SyncCycleResult> {
  console.log('[Sync] Starting sync cycle...');

  const pushResult = await pushChanges();
  if (pushResult.errors.length > 0) {
    console.error(`[Sync] Push completed with ${pushResult.errors.length} error(s):`);
    for (const err of pushResult.errors) {
      console.error(`  - ${err.message}`);
    }
  }

  const pullResult = await pullChanges();
  if (pullResult.errors.length > 0) {
    console.error(`[Sync] Pull completed with ${pullResult.errors.length} error(s):`);
    for (const err of pullResult.errors) {
      console.error(`  - ${err.message}`);
    }
  }

  return {
    pushed: pushResult.pushed,
    pulled: pullResult.pulled,
    skippedPush: pushResult.skipped,
    skippedPull: pullResult.skipped,
    pushErrors: pushResult.errors.length,
    pullErrors: pullResult.errors.length,
    pushErrorDetails: pushResult.errors.map(e => e.message),
    pullErrorDetails: pullResult.errors.map(e => e.message),
  };
}

// ============================================================================
// INITIAL SYNC
// ============================================================================

export interface InitialSyncResult {
  message: string;
  stats: { pushed: number; pulled: number; errors: number };
}

/** Run initial sync in the specified direction */
export async function runInitialSync(direction: 'push' | 'pull' | 'merge'): Promise<InitialSyncResult> {
  const localDb = await getLocalDb();
  const sql = getSupabaseSQL();
  const localClient = (localDb as any)._.session.client;

  let totalPushed = 0;
  let totalPulled = 0;
  let totalErrors = 0;
  const errorDetails: string[] = [];

  if (direction === 'push' || direction === 'merge') {
    for (const tableName of SYNC_TABLE_ORDER) {
      const columns = getTableColumns(tableName);
      if (columns.length === 0) continue;

      const localRows = await localClient.query(`SELECT * FROM ${q(tableName)}`);
      for (const row of localRows.rows) {
        try {
          await upsertToRemote(sql, tableName, row);
          totalPushed++;
        } catch (error) {
          const msg = error instanceof Error ? error.message : String(error);
          console.error(`[Initial Push] ${tableName}:${row.id}:`, msg);
          totalErrors++;
          if (errorDetails.length < 5) {
            errorDetails.push(`[${tableName}] ${msg}`);
          }
        }
      }
    }
  }

  if (direction === 'pull' || direction === 'merge') {
    for (const tableName of SYNC_TABLE_ORDER) {
      const columns = getTableColumns(tableName);
      if (columns.length === 0) continue;

      const remoteRows = await sql`SELECT * FROM ${sql(tableName)}`;
      for (const row of remoteRows) {
        try {
          if (direction === 'merge' && columns.includes('updated_at') && row.updated_at) {
            const localRow = await localClient.query(
              `SELECT "updated_at" FROM ${q(tableName)} WHERE id = $1`,
              [row.id]
            );
            if (localRow.rows.length > 0 && localRow.rows[0].updated_at) {
              const localUpdatedAt = new Date(localRow.rows[0].updated_at);
              const remoteUpdatedAt = new Date(row.updated_at);
              if (localUpdatedAt > remoteUpdatedAt) continue;
            }
          }

          await upsertToLocal(localClient, tableName, row, columns);
          totalPulled++;
        } catch (error) {
          const msg = error instanceof Error ? error.message : String(error);
          console.error(`[Initial Pull] ${tableName}:${row.id}:`, msg);
          totalErrors++;
          if (errorDetails.length < 5) {
            errorDetails.push(`[${tableName}] ${msg}`);
          }
        }
      }
    }
  }

  // Enable sync and set lastSyncAt — clear ALL changelog entries since initial sync
  // fully reconciles local and remote (avoids stale INSERT conflicts)
  saveSupabaseConfig({ lastSyncAt: new Date().toISOString(), enabled: true });
  await clearAllChangelogEntries();

  const label = direction === 'push' ? 'Push' : direction === 'pull' ? 'Pull' : 'Merge';
  let message = `Initial ${label} complete. Pushed: ${totalPushed}, Pulled: ${totalPulled}`;
  if (totalErrors > 0) {
    message += `. ${totalErrors} error(s): ${errorDetails.join('; ')}`;
  }
  return {
    message,
    stats: { pushed: totalPushed, pulled: totalPulled, errors: totalErrors },
  };
}

// ============================================================================
// HELPERS
// ============================================================================

/** Quote a column/table name to handle PostgreSQL reserved words (e.g. "order") */
function q(name: string): string {
  return `"${name}"`;
}

/**
 * When a push fails with FK violation, look up the missing parent record locally
 * and push it to Supabase. Recurses up the FK chain (e.g. budget_item -> category -> budget).
 */
async function tryPushMissingParents(
  sql: ReturnType<typeof postgres>,
  localClient: any,
  tableName: string,
  record: Record<string, any>,
  depth: number = 0,
): Promise<boolean> {
  if (depth > 5) return false; // safety limit

  const deps = FK_DEPENDENCIES[tableName];
  if (!deps) return false;

  let pushedAny = false;

  for (const [fkColumn, parentTable] of Object.entries(deps)) {
    const parentId = record[fkColumn];
    if (!parentId) continue;

    // Check if parent exists in Supabase
    const remoteCheck = await sql`
      SELECT id FROM ${sql(parentTable)} WHERE id = ${parentId}
    `;

    if (remoteCheck.length > 0) continue; // parent already exists remotely

    // Fetch parent from local DB
    const localRow = await localClient.query(
      `SELECT * FROM ${q(parentTable)} WHERE id = $1`,
      [parentId]
    );

    if (localRow.rows.length === 0) {
      console.warn(`[Sync Push] Parent ${parentTable}:${parentId} not found locally either`);
      continue;
    }

    const parentRecord = localRow.rows[0];

    // Recursively push the parent's parents first
    await tryPushMissingParents(sql, localClient, parentTable, parentRecord, depth + 1);

    try {
      await upsertToRemote(sql, parentTable, parentRecord);
      console.log(`[Sync Push] Auto-pushed missing parent ${parentTable}:${parentId}`);
      pushedAny = true;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[Sync Push] Failed to auto-push parent ${parentTable}:${parentId}: ${msg}`);
    }
  }

  return pushedAny;
}

/** Tables with unique constraints beyond the primary key (id).
 *  When upserting, we must handle conflicts on these columns too. */
const UNIQUE_CONSTRAINTS: Record<string, string> = {
  user_onboarding: 'user_id',
};

/** Upsert a record into the remote Supabase database */
async function upsertToRemote(sql: ReturnType<typeof postgres>, tableName: string, record: Record<string, any>): Promise<void> {
  const columns = getTableColumns(tableName);
  const values: any[] = [];
  const placeholders: string[] = [];
  const updateParts: string[] = [];

  for (let i = 0; i < columns.length; i++) {
    const col = columns[i];
    values.push(record[col] ?? null);
    placeholders.push(`$${i + 1}`);
    if (col !== 'id') {
      updateParts.push(`${q(col)} = $${i + 1}`);
    }
  }

  const quotedCols = columns.map(q).join(', ');
  const uniqueCol = UNIQUE_CONSTRAINTS[tableName];

  // If this table has an additional unique constraint (e.g. user_onboarding.user_id),
  // first try to resolve by updating the existing record that matches the unique column.
  // This handles the case where two devices create records with different UUIDs but the
  // same unique value (e.g. same user_id).
  if (uniqueCol && record[uniqueCol]) {
    const existing = await sql.unsafe(
      `SELECT "id" FROM ${q(tableName)} WHERE ${q(uniqueCol)} = $1 AND "id" != $2`,
      [record[uniqueCol], record.id]
    );

    if (existing.length > 0) {
      // A record with a different id but same unique value exists — update it in place
      const updateValues: any[] = [];
      const setParts: string[] = [];
      for (let i = 0; i < columns.length; i++) {
        const col = columns[i];
        if (col !== 'id') {
          updateValues.push(record[col] ?? null);
          setParts.push(`${q(col)} = $${updateValues.length}`);
        }
      }
      updateValues.push(existing[0].id);
      await sql.unsafe(
        `UPDATE ${q(tableName)} SET ${setParts.join(', ')} WHERE "id" = $${updateValues.length}`,
        updateValues
      );
      return;
    }
  }

  const upsertSQL = `
    INSERT INTO ${q(tableName)} (${quotedCols})
    VALUES (${placeholders.join(', ')})
    ON CONFLICT (id) DO UPDATE SET ${updateParts.join(', ')}
  `;

  await sql.unsafe(upsertSQL, values);
}

/** Upsert a record into the local PGlite database */
async function upsertToLocal(
  localClient: any,
  tableName: string,
  record: Record<string, any>,
  columns: string[]
): Promise<void> {
  const values: any[] = [];
  const placeholders: string[] = [];
  const updateParts: string[] = [];

  for (let i = 0; i < columns.length; i++) {
    const col = columns[i];
    values.push(record[col] ?? null);
    placeholders.push(`$${i + 1}`);
    if (col !== 'id') {
      updateParts.push(`${q(col)} = $${i + 1}`);
    }
  }

  const quotedCols = columns.map(q).join(', ');
  const uniqueCol = UNIQUE_CONSTRAINTS[tableName];

  // Wrap in transaction with syncing flag to suppress changelog trigger
  await localClient.transaction(async (tx: any) => {
    await tx.query("SET LOCAL app.syncing = 'true'");

    // Handle tables with additional unique constraints (e.g. user_onboarding.user_id)
    if (uniqueCol && record[uniqueCol]) {
      const existing = await tx.query(
        `SELECT "id" FROM ${q(tableName)} WHERE ${q(uniqueCol)} = $1 AND "id" != $2`,
        [record[uniqueCol], record.id]
      );

      if (existing.rows.length > 0) {
        // A record with a different id but same unique value exists — update it in place
        const updateValues: any[] = [];
        const setParts: string[] = [];
        for (let i = 0; i < columns.length; i++) {
          const col = columns[i];
          if (col !== 'id') {
            updateValues.push(record[col] ?? null);
            setParts.push(`${q(col)} = $${updateValues.length}`);
          }
        }
        updateValues.push(existing.rows[0].id);
        await tx.query(
          `UPDATE ${q(tableName)} SET ${setParts.join(', ')} WHERE "id" = $${updateValues.length}`,
          updateValues
        );
        return;
      }
    }

    const upsertSQL = `
      INSERT INTO ${q(tableName)} (${quotedCols})
      VALUES (${placeholders.join(', ')})
      ON CONFLICT (id) DO UPDATE SET ${updateParts.join(', ')}
    `;
    await tx.query(upsertSQL, values);
  });
}
