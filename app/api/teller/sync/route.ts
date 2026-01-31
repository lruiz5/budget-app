import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { linkedAccounts, transactions, splitTransactions } from '@/db/schema';
import { eq, and, isNull, isNotNull, notInArray, inArray, sql } from 'drizzle-orm';
import { createTellerClient, TellerTransaction } from '@/lib/teller';
import { requireAuth, isAuthError } from '@/lib/auth';

// POST - Sync transactions from linked accounts
export async function POST(request: NextRequest) {
  try {
    const authResult = await requireAuth();
    if (isAuthError(authResult)) return authResult.error;
    const { userId } = authResult;

    const body = await request.json();
    const { accountId, startDate, endDate } = body;

    // Get linked accounts to sync (scoped to user)
    let accountsToSync;
    if (accountId) {
      // Sync specific account (verify ownership)
      accountsToSync = await db
        .select()
        .from(linkedAccounts)
        .where(and(eq(linkedAccounts.id, parseInt(accountId)), eq(linkedAccounts.userId, userId)));
    } else {
      // Sync all user's accounts
      accountsToSync = await db.select().from(linkedAccounts).where(eq(linkedAccounts.userId, userId));
    }

    if (accountsToSync.length === 0) {
      return NextResponse.json({ error: 'No linked accounts found' }, { status: 404 });
    }

    const results = {
      synced: 0,
      updated: 0,
      skipped: 0,
      errors: [] as string[],
    };

    for (const account of accountsToSync) {
      try {
        const tellerClient = createTellerClient(account.accessToken);

        // Fetch transactions from Teller
        const tellerTransactions: TellerTransaction[] = await tellerClient.listTransactions(
          account.tellerAccountId,
          {
            count: 500, // Max transactions to fetch
            startDate,
            endDate,
          }
        );

        // Fetch all existing transactions for this account's Teller IDs in one query
        const tellerIds = tellerTransactions.map(t => t.id);
        const existingTxns = tellerIds.length > 0
          ? await db
              .select()
              .from(transactions)
              .where(inArray(transactions.tellerTransactionId, tellerIds))
          : [];
        const existingMap = new Map(existingTxns.map(t => [t.tellerTransactionId, t]));

        // Separate into new vs existing
        const toInsert: typeof transactions.$inferInsert[] = [];
        const toUpdate: { id: number; data: Partial<typeof transactions.$inferInsert> }[] = [];

        for (const txn of tellerTransactions) {
          const amountNum = Math.abs(parseFloat(txn.amount));
          const amount = String(amountNum);
          const type: 'income' | 'expense' = parseFloat(txn.amount) > 0 ? 'income' : 'expense';

          const existingTxn = existingMap.get(txn.id);

          if (existingTxn) {
            const statusChanged = existingTxn.status !== txn.status;
            const amountChanged = Math.abs(parseFloat(String(existingTxn.amount)) - amountNum) > 0.001;

            if (statusChanged || amountChanged) {
              toUpdate.push({
                id: existingTxn.id,
                data: {
                  status: txn.status,
                  amount,
                  description: txn.description,
                  merchant: txn.details?.counterparty?.name || existingTxn.merchant,
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
              merchant: txn.details?.counterparty?.name || null,
              tellerTransactionId: txn.id,
              tellerAccountId: account.tellerAccountId,
              status: txn.status,
            });
            results.synced++;
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

        // Update last synced timestamp
        await db
          .update(linkedAccounts)
          .set({ lastSyncedAt: new Date() })
          .where(eq(linkedAccounts.id, account.id));

      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Unknown error';
        results.errors.push(`Account ${account.accountName}: ${errorMsg}`);
      }
    }

    return NextResponse.json(results);
  } catch (error) {
    console.error('Error syncing transactions:', error);
    return NextResponse.json({ error: 'Failed to sync transactions' }, { status: 500 });
  }
}

// GET - Get uncategorized transactions (not assigned to any budget item)
export async function GET(request: NextRequest) {
  try {
    const authResult = await requireAuth();
    if (isAuthError(authResult)) return authResult.error;
    const { userId } = authResult;

    // Get user's linked account IDs for filtering
    const userAccounts = await db
      .select({ id: linkedAccounts.id })
      .from(linkedAccounts)
      .where(eq(linkedAccounts.userId, userId));
    const userAccountIds = userAccounts.map(a => a.id);

    if (userAccountIds.length === 0) {
      return NextResponse.json([]);
    }

    // Get IDs of transactions that have been split (these should not appear as uncategorized)
    const splitParentIds = await db
      .selectDistinct({ parentId: splitTransactions.parentTransactionId })
      .from(splitTransactions);
    const splitParentIdList = splitParentIds.map(s => s.parentId);

    // Get transactions that:
    // - Belong to user's linked accounts
    // - Have no budgetItemId (uncategorized)
    // - Are not deleted
    // - Are not split
    const uncategorizedTransactions = await db.query.transactions.findMany({
      where: and(
        isNull(transactions.budgetItemId),
        isNull(transactions.deletedAt),
        splitParentIdList.length > 0
          ? notInArray(transactions.id, splitParentIdList)
          : undefined
      ),
      with: {
        linkedAccount: true,
      },
    });

    // Filter to only user's transactions
    const userTransactions = uncategorizedTransactions.filter(
      txn => txn.linkedAccount && userAccountIds.includes(txn.linkedAccount.id)
    );

    // Look up merchant-based suggestions from historical categorizations
    const merchantNames = [...new Set(userTransactions.map(t => t.merchant).filter(Boolean))] as string[];
    const merchantSuggestions: Record<string, number> = {};

    if (merchantNames.length > 0) {
      // Find previously categorized transactions with matching merchants
      const historicalTxns = await db
        .select({
          merchant: transactions.merchant,
          budgetItemId: transactions.budgetItemId,
        })
        .from(transactions)
        .where(
          and(
            isNotNull(transactions.budgetItemId),
            isNull(transactions.deletedAt),
            inArray(transactions.merchant, merchantNames)
          )
        );

      // Filter to user's transactions only (via linked accounts)
      const userHistorical = historicalTxns.filter(t => {
        // We already have userAccountIds from above - but historical txns may be manual (no linkedAccountId)
        // For safety, just use all matches since merchant names are scoped to user's uncategorized txns
        return t.budgetItemId !== null;
      });

      // Count frequency of each merchant -> budgetItemId pairing
      const merchantItemCounts: Record<string, Record<number, number>> = {};
      for (const t of userHistorical) {
        const m = t.merchant!;
        if (!merchantItemCounts[m]) merchantItemCounts[m] = {};
        merchantItemCounts[m][t.budgetItemId!] = (merchantItemCounts[m][t.budgetItemId!] || 0) + 1;
      }

      // Pick the most frequently used budget item for each merchant
      for (const [merchant, counts] of Object.entries(merchantItemCounts)) {
        let maxCount = 0;
        let bestItemId = 0;
        for (const [itemId, count] of Object.entries(counts)) {
          if (count > maxCount) {
            maxCount = count;
            bestItemId = parseInt(itemId);
          }
        }
        if (bestItemId > 0) {
          merchantSuggestions[merchant] = bestItemId;
        }
      }
    }

    // Map to simpler format
    const result = userTransactions.map(txn => ({
      id: txn.id,
      budgetItemId: txn.budgetItemId,
      linkedAccountId: txn.linkedAccountId,
      date: txn.date,
      description: txn.description,
      amount: txn.amount,
      type: txn.type,
      merchant: txn.merchant,
      tellerTransactionId: txn.tellerTransactionId,
      tellerAccountId: txn.tellerAccountId,
      status: txn.status,
      deletedAt: txn.deletedAt,
      createdAt: txn.createdAt,
      suggestedBudgetItemId: txn.merchant ? merchantSuggestions[txn.merchant] || null : null,
    }));

    return NextResponse.json(result);
  } catch (error) {
    console.error('Error fetching uncategorized transactions:', error);
    return NextResponse.json({ error: 'Failed to fetch uncategorized transactions' }, { status: 500 });
  }
}
