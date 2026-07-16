import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { budgets, budgetCategories, budgetItems, linkedAccounts, transactions, splitTransactions } from '@/db/schema';
import { eq, and, isNull, isNotNull, notInArray, inArray } from 'drizzle-orm';
import { syncSimplefinAccounts, lazySyncIfStale } from '@/lib/bankSync';
import { requireAuth, isAuthError } from '@/lib/auth';

// POST - Sync transactions from linked accounts
export async function POST(request: NextRequest) {
  try {
    const authResult = await requireAuth();
    if (isAuthError(authResult)) return authResult.error;
    const { userId } = authResult;

    const body = await request.json();
    const { accountId, startDate } = body;

    // Get linked accounts to sync (scoped to user)
    let accountsToSync;
    if (accountId) {
      // Sync specific account (verify ownership)
      accountsToSync = await db
        .select()
        .from(linkedAccounts)
        .where(and(eq(linkedAccounts.id, parseInt(accountId)), eq(linkedAccounts.userId, userId)));
    } else {
      // Sync all user's accounts that have sync enabled
      accountsToSync = await db.select().from(linkedAccounts).where(
        and(
          eq(linkedAccounts.userId, userId),
          eq(linkedAccounts.syncEnabled, true),
          eq(linkedAccounts.provider, 'simplefin')
        )
      );
    }

    if (accountsToSync.length === 0) {
      return NextResponse.json({ error: 'No linked accounts found' }, { status: 404 });
    }

    const results = await syncSimplefinAccounts(accountsToSync, startDate);

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

    // Auto-sync accounts that haven't synced in the last hour, so fresh bank
    // data appears without pressing Sync. Errors are logged, not surfaced —
    // this response is a plain transaction array and manual sync still reports.
    try {
      await lazySyncIfStale(userId);
    } catch (error) {
      console.warn('Lazy bank sync failed:', error);
    }

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

    // Get month/year from query params for current-month item lookup
    const { searchParams } = new URL(request.url);
    const month = searchParams.get('month');
    const year = searchParams.get('year');

    if (merchantNames.length > 0 && month !== null && year !== null) {
      // Find previously categorized transactions with matching merchants, joined to get item name
      const historicalTxns = await db
        .select({
          merchant: transactions.merchant,
          budgetItemName: budgetItems.name,
        })
        .from(transactions)
        .innerJoin(budgetItems, eq(transactions.budgetItemId, budgetItems.id))
        .where(
          and(
            isNotNull(transactions.budgetItemId),
            isNull(transactions.deletedAt),
            inArray(transactions.merchant, merchantNames)
          )
        );

      // Count frequency of each merchant -> item name pairing
      const merchantNameCounts: Record<string, Record<string, number>> = {};
      for (const t of historicalTxns) {
        const m = t.merchant!;
        if (!merchantNameCounts[m]) merchantNameCounts[m] = {};
        merchantNameCounts[m][t.budgetItemName] = (merchantNameCounts[m][t.budgetItemName] || 0) + 1;
      }

      // Pick the most frequently used item name for each merchant
      const merchantBestItemName: Record<string, string> = {};
      for (const [merchant, counts] of Object.entries(merchantNameCounts)) {
        let maxCount = 0;
        let bestName = '';
        for (const [itemName, count] of Object.entries(counts)) {
          if (count > maxCount) {
            maxCount = count;
            bestName = itemName;
          }
        }
        if (bestName) {
          merchantBestItemName[merchant] = bestName;
        }
      }

      // Look up current month's budget items by name
      const itemNames = [...new Set(Object.values(merchantBestItemName))];
      if (itemNames.length > 0) {
        const currentMonthItems = await db
          .select({
            id: budgetItems.id,
            name: budgetItems.name,
          })
          .from(budgetItems)
          .innerJoin(budgetCategories, eq(budgetItems.categoryId, budgetCategories.id))
          .innerJoin(budgets, eq(budgetCategories.budgetId, budgets.id))
          .where(
            and(
              eq(budgets.userId, userId),
              eq(budgets.month, parseInt(month)),
              eq(budgets.year, parseInt(year)),
              inArray(budgetItems.name, itemNames)
            )
          );

        const nameToCurrentId = new Map(currentMonthItems.map(i => [i.name, i.id]));

        for (const [merchant, itemName] of Object.entries(merchantBestItemName)) {
          const currentId = nameToCurrentId.get(itemName);
          if (currentId) {
            merchantSuggestions[merchant] = currentId;
          }
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
