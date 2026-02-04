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
};

// Re-export schema tables and relations for direct imports
export * from './schema';
