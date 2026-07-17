import { db } from '@/db';
import { linkedAccounts, transactions } from '@/db/schema';
import { eq, and, isNull, notInArray, inArray, or, lt } from 'drizzle-orm';
import { getAccountsWithHistory, unixToDateString, SimpleFINAccountSet } from '@/lib/simplefin';

export interface SyncResults {
  synced: number;
  updated: number;
  skipped: number;
  errors: string[];
}

type LinkedAccountRow = typeof linkedAccounts.$inferSelect;

// Core SimpleFIN sync: pull provider transactions for each account and
// insert/update local rows. Shared by the manual sync endpoint (POST
// /api/bank/sync) and the lazy hourly sync (lazySyncIfStale).
export async function syncSimplefinAccounts(
  accountsToSync: LinkedAccountRow[],
  startDate?: string
): Promise<SyncResults> {
  const results: SyncResults = {
    synced: 0,
    updated: 0,
    skipped: 0,
    errors: [],
  };

  // SimpleFIN: one fetch per access URL covers all of its accounts — cache across the loop
  const simplefinCache = new Map<string, SimpleFINAccountSet>();

  for (const account of accountsToSync) {
    try {
      if (account.provider !== 'simplefin') {
        throw new Error('Account is not connected via SimpleFIN — sync is unavailable');
      }

      const effectiveStartDate = startDate || account.syncStartDate || undefined;
      const startUnix = effectiveStartDate
        ? Math.floor(Date.parse(`${effectiveStartDate}T00:00:00Z`) / 1000)
        : Math.floor(Date.now() / 1000) - 90 * 86400;
      const cacheKey = `${account.accessToken}|${startUnix}`;
      let accountSet = simplefinCache.get(cacheKey);
      if (!accountSet) {
        accountSet = await getAccountsWithHistory(account.accessToken, { startDate: startUnix });
        simplefinCache.set(cacheKey, accountSet);
        // Surface connection-level warnings (e.g. "Connection may need attention")
        // once per access URL — SimpleFIN reports them alongside a 200 response
        results.errors.push(...accountSet.errors);
      }
      const sfAccount = accountSet.accounts.find(a => a.id === account.tellerAccountId);
      if (!sfAccount) {
        throw new Error('Account not present in SimpleFIN response');
      }
      const providerTxns = (sfAccount.transactions || []).map(t => ({
        // SimpleFIN txn IDs are only unique per account — namespace with the
        // account ID so the global unique constraint + dedup lookups hold
        id: `${account.tellerAccountId}:${t.id}`,
        date: unixToDateString(t.posted || t.transacted_at || Math.floor(Date.now() / 1000)),
        amount: t.amount,
        description: '', // description = user notes only; SimpleFIN payee → merchant
        merchant: t.payee?.trim() || t.description?.trim() || null,
        status: (t.pending ? 'pending' : 'posted') as 'pending' | 'posted',
      }));

      // Fetch all existing transactions for this account's provider IDs in one query
      const providerIds = providerTxns.map(t => t.id);
      const existingTxns = providerIds.length > 0
        ? await db
            .select()
            .from(transactions)
            .where(inArray(transactions.tellerTransactionId, providerIds))
        : [];
      const existingMap = new Map(existingTxns.map(t => [t.tellerTransactionId, t]));

      // Separate into new vs existing
      let toInsert: typeof transactions.$inferInsert[] = [];
      const toUpdate: { id: number; data: Partial<typeof transactions.$inferInsert> }[] = [];

      for (const txn of providerTxns) {
        const amountNum = Math.abs(parseFloat(txn.amount));
        const amount = String(amountNum);
        const type: 'income' | 'expense' = parseFloat(txn.amount) > 0 ? 'income' : 'expense';

        const existingTxn = existingMap.get(txn.id);

        if (existingTxn) {
          const statusChanged = existingTxn.status !== txn.status;
          const amountChanged = Math.abs(parseFloat(String(existingTxn.amount)) - amountNum) > 0.001;

          if (statusChanged || amountChanged) {
            // description is never touched here — it holds user notes only
            toUpdate.push({
              id: existingTxn.id,
              data: {
                status: txn.status,
                amount,
                merchant: txn.merchant || existingTxn.merchant,
              },
            });
            results.updated++;
          } else {
            results.skipped++;
          }
        } else {
          toInsert.push({
            budgetItemId: null,
            linkedAccountId: account.id,
            date: txn.date,
            description: txn.description,
            amount,
            type,
            merchant: txn.merchant,
            tellerTransactionId: txn.id,
            tellerAccountId: account.tellerAccountId,
            status: txn.status,
          });
          results.synced++;
        }
      }

      // Fuzzy-match new posted transactions to stale pending ones
      // (some banks issue new IDs when pending → posted, e.g. restaurant tips)
      if (toInsert.length > 0) {
        const stalePending = await db
          .select()
          .from(transactions)
          .where(
            and(
              eq(transactions.linkedAccountId, account.id),
              eq(transactions.status, 'pending'),
              isNull(transactions.deletedAt),
              providerIds.length > 0
                ? notInArray(transactions.tellerTransactionId!, providerIds)
                : undefined
            )
          );

        if (stalePending.length > 0) {
          const matched = new Set<number>();
          const stillToInsert: typeof toInsert = [];

          for (const newTxn of toInsert) {
            if (newTxn.status !== 'posted') {
              stillToInsert.push(newTxn);
              continue;
            }

            const match = stalePending.find(p => {
              if (matched.has(p.id)) return false;
              const withinDateRange = Math.abs(
                (new Date(newTxn.date!).getTime() - new Date(p.date).getTime()) / 86400000
              ) <= 7;
              if (!withinDateRange) return false;

              // Merchant match (SimpleFIN descriptions are empty — payee is the identity)
              return !!(p.merchant && newTxn.merchant &&
                  p.merchant.toLowerCase() === newTxn.merchant.toLowerCase());
            });

            if (match) {
              matched.add(match.id);
              // description is never touched here — it holds user notes only
              toUpdate.push({
                id: match.id,
                data: {
                  tellerTransactionId: newTxn.tellerTransactionId,
                  status: 'posted',
                  amount: newTxn.amount,
                  merchant: newTxn.merchant || match.merchant,
                  date: newTxn.date,
                },
              });
              results.updated++;
              results.synced--;
            } else {
              stillToInsert.push(newTxn);
            }
          }

          toInsert = stillToInsert;
        }
      }

      // Batch insert new transactions
      if (toInsert.length > 0) {
        await db.insert(transactions).values(toInsert);
      }

      // Updates still need individual queries (different data per row)
      for (const { id, data } of toUpdate) {
        await db.update(transactions).set(data).where(eq(transactions.id, id));
      }

      // Update sync timestamps — lastSuccessfulSyncAt only ever moves here,
      // so it stays truthful even though the lazy-sync claim bumps lastSyncedAt
      await db
        .update(linkedAccounts)
        .set({ lastSyncedAt: new Date(), lastSuccessfulSyncAt: new Date() })
        .where(eq(linkedAccounts.id, account.id));

    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      results.errors.push(`Account ${account.accountName}: ${errorMsg}`);
    }
  }

  return results;
}

// Lazy hourly sync — SimpleFIN only refreshes bank data ~once/24h and caps
// usage at ~24 requests/day, so polling more than hourly is pure waste.
export const SYNC_STALENESS_MS = 60 * 60 * 1000;

// Sync the user's accounts if they haven't synced in the last hour.
// The claim (bumping lastSyncedAt up front, filtered on the old value) is
// atomic, so concurrent requests can't trigger duplicate SimpleFIN calls.
// It also stands even if the sync then fails — a broken connection retries
// hourly instead of on every request, protecting the daily quota.
export async function lazySyncIfStale(userId: string): Promise<void> {
  const cutoff = new Date(Date.now() - SYNC_STALENESS_MS);
  const claimed = await db
    .update(linkedAccounts)
    .set({ lastSyncedAt: new Date() })
    .where(
      and(
        eq(linkedAccounts.userId, userId),
        eq(linkedAccounts.provider, 'simplefin'),
        eq(linkedAccounts.syncEnabled, true),
        or(isNull(linkedAccounts.lastSyncedAt), lt(linkedAccounts.lastSyncedAt, cutoff))
      )
    )
    .returning();

  if (claimed.length === 0) return;

  const results = await syncSimplefinAccounts(claimed);
  if (results.errors.length > 0) {
    console.warn('Lazy bank sync issues:', results.errors);
  }
}
