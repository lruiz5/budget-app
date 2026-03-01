import {
  getLocalDb,
  closeLocalDb,
  getDbInitError,
  getDbPath,
  resetDbError,
  isDbInitialized,
  getDbStatus,
  listBackups,
  createBackup,
  deleteLocalDb,
  restoreFromBackup,
  deleteBackup,
  schema,
} from './local';
import { createCloudDb, getCloudDb } from './cloud';
import { loadSupabaseConfig, saveSupabaseConfig, isSupabaseEnabled, getInstanceId, maskKey } from './supabase-config';
import { getSupabaseSQL, closeSupabaseDb, resetSupabaseConnection, testSupabaseConnection } from './supabase-client';

/**
 * Get the primary database instance.
 * Uses local PGlite database for all app operations.
 *
 * Usage in API routes:
 *   const db = await getDb();
 *   const result = await db.query.budgets.findFirst(...);
 */
export async function getDb() {
  return getLocalDb();
}

// Re-export for convenience
export {
  getLocalDb,
  closeLocalDb,
  getDbInitError,
  getDbPath,
  resetDbError,
  isDbInitialized,
  getDbStatus,
  listBackups,
  createBackup,
  deleteLocalDb,
  restoreFromBackup,
  deleteBackup,
  createCloudDb,
  getCloudDb,
  schema,
  // Supabase sync
  loadSupabaseConfig,
  saveSupabaseConfig,
  isSupabaseEnabled,
  getInstanceId,
  maskKey,
  getSupabaseSQL,
  closeSupabaseDb,
  resetSupabaseConnection,
  testSupabaseConnection,
};

// Re-export schema tables and relations for direct imports
export * from '../schema';

// Re-export sync changelog helpers
export {
  getPendingChanges,
  getPendingCount,
  markSynced,
  markSyncError,
  clearSyncedEntries,
  clearAllChangelogEntries,
  setSyncingFlag,
} from './sync-changelog';
export type { ChangelogEntry } from './sync-changelog';
