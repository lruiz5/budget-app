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
const MAX_CONSECUTIVE_FAILURES = 10; // Stop scheduler after this many failures

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
  runSyncTick().catch((err) => {
    console.error('[Sync] Unhandled error in initial sync tick:', err);
  });

  intervalHandle = setInterval(() => {
    runSyncTick().catch((err) => {
      console.error('[Sync] Unhandled error in sync tick:', err);
    });
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

      const totalErrors = result.pushErrors + result.pullErrors;
      status.state = totalErrors > 0 ? 'error' : 'idle';
      if (totalErrors > 0) {
        const allDetails = [...(result.pushErrorDetails || []), ...(result.pullErrorDetails || [])];
        status.lastError = `Sync completed with ${totalErrors} error(s): ${allDetails.join('; ')}`;
      } else {
        status.lastError = null;
      }
      status.consecutiveFailures = 0;
      status.pendingCount = await getPendingCount();

      if (result.pushed > 0 || result.pulled > 0 || totalErrors > 0) {
        console.log(`[Sync] Cycle complete: pushed=${result.pushed}, pulled=${result.pulled}, pushErrors=${result.pushErrors}, pullErrors=${result.pullErrors}`);
      }

      // Reset interval to default if we had backed off
      if (currentInterval !== DEFAULT_INTERVAL && intervalHandle) {
        clearInterval(intervalHandle);
        currentInterval = DEFAULT_INTERVAL;
        intervalHandle = setInterval(() => {
          runSyncTick().catch((err) => {
            console.error('[Sync] Unhandled error in sync tick:', err);
          });
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

      // Log the full error with stack trace for debugging
      if (error instanceof Error && error.stack) {
        console.error(`[Sync] Error (attempt ${status.consecutiveFailures}):\n${error.stack}`);
      } else {
        console.error(`[Sync] Error (attempt ${status.consecutiveFailures}): ${message}`);
      }

      // Stop scheduler after too many consecutive failures
      if (status.consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
        console.error(`[Sync] Stopping scheduler after ${MAX_CONSECUTIVE_FAILURES} consecutive failures. Last error: ${message}`);
        if (intervalHandle) {
          clearInterval(intervalHandle);
          intervalHandle = null;
        }
        return null;
      }

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
          runSyncTick().catch((err) => {
            console.error('[Sync] Unhandled error in sync tick:', err);
          });
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
