import { isSupabaseEnabled } from './supabase-config';
import { getPendingCount } from './sync-changelog';
import { runSyncCycle } from './sync-engine';
import { resetSupabaseConnection } from './supabase-client';

export type SyncState = 'idle' | 'syncing' | 'offline' | 'error' | 'disabled';

export interface SyncStatus {
  state: SyncState;
  pendingCount: number;
  lastError: string | null;
  consecutiveFailures: number;
}

const DEFAULT_INTERVAL = 30_000; // 30 seconds
const MAX_BACKOFF = 300_000; // 5 minutes
const POOL_RESET_THRESHOLD = 2;

let intervalHandle: ReturnType<typeof setInterval> | null = null;
let currentInterval = DEFAULT_INTERVAL;
let activeSyncPromise: Promise<any> | null = null;

let status: SyncStatus = {
  state: 'disabled',
  pendingCount: 0,
  lastError: null,
  consecutiveFailures: 0,
};

/** Get current sync status */
export function getSyncStatus(): SyncStatus {
  return { ...status };
}

/** Start the background sync scheduler */
export function startSyncScheduler(intervalMs: number = DEFAULT_INTERVAL): void {
  if (intervalHandle) {
    clearInterval(intervalHandle);
  }

  if (!isSupabaseEnabled()) {
    status.state = 'disabled';
    console.log('[Sync] Supabase sync is not enabled, scheduler not started');
    return;
  }

  currentInterval = intervalMs;
  status.state = 'idle';
  console.log(`[Sync] Starting sync scheduler (interval: ${intervalMs}ms)`);

  // Run first sync immediately
  runSyncTick().catch(() => {});

  intervalHandle = setInterval(() => {
    runSyncTick().catch(() => {});
  }, currentInterval);
}

/** Stop the sync scheduler */
export function stopSyncScheduler(): void {
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
  }
  status.state = 'disabled';
  console.log('[Sync] Scheduler stopped');
}

/** Trigger a manual sync (returns a promise that resolves when sync completes) */
export async function triggerSync(): Promise<any> {
  if (activeSyncPromise) {
    return activeSyncPromise;
  }
  return runSyncTick();
}

/** Restart the scheduler (e.g., when config changes) */
export function restartSyncScheduler(): void {
  stopSyncScheduler();
  startSyncScheduler(DEFAULT_INTERVAL);
}

async function runSyncTick(): Promise<any> {
  if (status.state === 'syncing' && activeSyncPromise) return activeSyncPromise;

  if (!isSupabaseEnabled()) {
    status.state = 'disabled';
    return;
  }

  status.state = 'syncing';
  activeSyncPromise = (async () => {
    try {
      status.pendingCount = await getPendingCount();
      const result = await runSyncCycle();

      status.state = result.pushErrors > 0 || result.pullErrors > 0 ? 'error' : 'idle';
      status.lastError = result.pushErrors > 0 || result.pullErrors > 0
        ? `Sync complete with ${result.pushErrors + result.pullErrors} errors.`
        : null;
      status.consecutiveFailures = 0;
      status.pendingCount = await getPendingCount();

      if (result.pushed > 0 || result.pulled > 0 || result.pushErrors > 0 || result.pullErrors > 0) {
        console.log(`[Sync] Cycle complete: pushed=${result.pushed}, pulled=${result.pulled}, errors=${result.pushErrors + result.pullErrors}`);
      }

      // Reset interval to default if we had backed off
      if (currentInterval !== DEFAULT_INTERVAL && intervalHandle) {
        clearInterval(intervalHandle);
        currentInterval = DEFAULT_INTERVAL;
        intervalHandle = setInterval(() => {
          runSyncTick().catch(() => {});
        }, currentInterval);
      }
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);

      const isNetworkError = message.includes('ECONNREFUSED') ||
        message.includes('ENOTFOUND') ||
        message.includes('ETIMEDOUT') ||
        message.includes('getaddrinfo') ||
        message.includes('ECONNRESET') ||
        message.includes('Connection terminated') ||
        message.includes('timeout expired') ||
        message.includes('statement timeout');

      status.state = isNetworkError ? 'offline' : 'error';
      status.lastError = message;
      status.consecutiveFailures++;

      console.error(`[Sync] Error (attempt ${status.consecutiveFailures}): ${message}`);

      if (status.consecutiveFailures >= POOL_RESET_THRESHOLD) {
        console.log('[Sync] Resetting Supabase connection after repeated failures');
        try {
          await resetSupabaseConnection();
        } catch (resetErr) {
          console.error('[Sync] Error resetting connection:', resetErr);
        }
      }

      // Exponential backoff
      const backoffInterval = Math.min(
        DEFAULT_INTERVAL * Math.pow(2, status.consecutiveFailures),
        MAX_BACKOFF
      );

      if (backoffInterval !== currentInterval && intervalHandle) {
        clearInterval(intervalHandle);
        currentInterval = backoffInterval;
        intervalHandle = setInterval(() => {
          runSyncTick().catch(() => {});
        }, currentInterval);
        console.log(`[Sync] Backing off to ${currentInterval}ms interval`);
      }

      return null;
    } finally {
      activeSyncPromise = null;
    }
  })();

  return activeSyncPromise;
}
