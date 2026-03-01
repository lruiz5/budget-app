import { getLocalDb } from './local';

export interface ChangelogEntry {
  id: number;
  table_name: string;
  record_id: string;
  operation: 'INSERT' | 'UPDATE' | 'DELETE';
  changed_at: Date;
  error_message?: string;
  last_attempt_at?: Date;
}

/** Access the underlying PGlite client from a Drizzle instance */
function getClient(db: any) {
  return db._.session.client;
}

/** Get all unsynced changelog entries, ordered by id (chronological) */
export async function getPendingChanges(): Promise<ChangelogEntry[]> {
  const db = await getLocalDb();
  const client = getClient(db);
  const result = await client.query(
    `SELECT id, table_name, record_id, operation, changed_at, error_message, last_attempt_at
     FROM sync_changelog
     WHERE synced = false
     ORDER BY id ASC`
  );
  return result.rows as ChangelogEntry[];
}

/** Get count of unsynced changelog entries */
export async function getPendingCount(): Promise<number> {
  const db = await getLocalDb();
  const client = getClient(db);
  const result = await client.query(
    `SELECT COUNT(*) as count FROM sync_changelog WHERE synced = false`
  );
  return parseInt(result.rows[0].count, 10);
}

/** Mark specific changelog entries as synced */
export async function markSynced(ids: number[]): Promise<void> {
  if (ids.length === 0) return;
  const db = await getLocalDb();
  const client = getClient(db);
  const placeholders = ids.map((_, i) => `$${i + 1}`).join(', ');
  await client.query(
    `UPDATE sync_changelog
     SET synced = true, error_message = NULL, last_attempt_at = NOW()
     WHERE id IN (${placeholders})`,
    ids
  );
}

/** Mark a changelog entry with an error */
export async function markSyncError(id: number, message: string): Promise<void> {
  const db = await getLocalDb();
  const client = getClient(db);
  await client.query(
    `UPDATE sync_changelog
     SET error_message = $1, last_attempt_at = NOW()
     WHERE id = $2`,
    [message, id]
  );
}

/** Remove old synced entries (housekeeping) */
export async function clearSyncedEntries(): Promise<number> {
  const db = await getLocalDb();
  const client = getClient(db);
  const result = await client.query(
    `DELETE FROM sync_changelog WHERE synced = true RETURNING id`
  );
  return result.rows.length;
}

/** Remove ALL changelog entries (used after initial sync to reset state) */
export async function clearAllChangelogEntries(): Promise<number> {
  const db = await getLocalDb();
  const client = getClient(db);
  const result = await client.query(
    `DELETE FROM sync_changelog RETURNING id`
  );
  return result.rows.length;
}

/** Set the app.syncing flag to suppress trigger logging during sync pulls */
export async function setSyncingFlag(value: boolean): Promise<void> {
  const db = await getLocalDb();
  const client = getClient(db);
  await client.query(`SET app.syncing = '${value}'`);
}
