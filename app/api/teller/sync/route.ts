import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/db';
import { linkedAccounts, transactions, splitTransactions, budgets, budgetCategories, budgetItems } from '@/db/schema';
import { eq, and, isNull, isNotNull, notInArray, inArray, sql } from 'drizzle-orm';
import { createTellerClient, TellerTransaction } from '@/lib/teller';
import { requireAuth, isAuthError } from '@/lib/auth';

// POST - Sync transactions from linked accounts
export async function POST(request: NextRequest) {
  try {
    const authResult = await requireAuth();
    if (isAuthError(authResult)) return authResult.error;
    const { userId } = authResult;

    const db = await getDb();
    const body = await request.json();
    const { accountId, startDate, endDate } = body;

    // Get linked Teller accounts to sync (scoped to user, only Teller accounts)
    let accountsToSync;
    if (accountId) {
      // Sync specific account (verify ownership and it's a Teller account)
      accountsToSync = await db
        .select()
        .from(linkedAccounts)
        .where(and(
          eq(linkedAccounts.id, accountId),
          eq(linkedAccounts.userId, userId),
          eq(linkedAccounts.accountSource, 'teller')
        ));
    } else {
      // Sync all user's Teller accounts
      accountsToSync = await db.select().from(linkedAccounts).where(
        and(eq(linkedAccounts.userId, userId), eq(linkedAccounts.accountSource, 'teller'))
      );
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
      // Skip if missing required Teller fields (shouldn't happen for Teller accounts)
      if (!account.accessToken || !account.tellerAccountId) {
        results.errors.push(`Account ${account.accountName}: Missing Teller credentials`);
        continue;
      }

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
        const toUpdate: { id: string; data: Partial<typeof transactions.$inferInsert> }[] = [];

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

    // Get month/year from query params for cross-month suggestions
    const { searchParams } = new URL(request.url);
    const monthParam = searchParams.get('month');
    const yearParam = searchParams.get('year');
    const currentMonth = monthParam !== null ? parseInt(monthParam) : new Date().getMonth();
    const currentYear = yearParam !== null ? parseInt(yearParam) : new Date().getFullYear();

    const db = await getDb();
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
    const merchantSuggestions: Record<string, string> = {};

    if (merchantNames.length > 0) {
      // Find previously categorized transactions with matching merchants
      // Join with budget items to get the item name and category type
      const historicalTxns = await db
        .select({
          merchant: transactions.merchant,
          itemName: budgetItems.name,
          categoryType: budgetCategories.categoryType,
        })
        .from(transactions)
        .innerJoin(budgetItems, eq(transactions.budgetItemId, budgetItems.id))
        .innerJoin(budgetCategories, eq(budgetItems.categoryId, budgetCategories.id))
        .where(
          and(
            isNotNull(transactions.budgetItemId),
            isNull(transactions.deletedAt),
            inArray(transactions.merchant, merchantNames)
          )
        );

      // Count frequency of each merchant -> (itemName, categoryType) pairing
      const merchantItemCounts: Record<string, Record<string, number>> = {};
      for (const t of historicalTxns) {
        const m = t.merchant!;
        const key = `${t.categoryType}|${t.itemName}`;
        if (!merchantItemCounts[m]) merchantItemCounts[m] = {};
        merchantItemCounts[m][key] = (merchantItemCounts[m][key] || 0) + 1;
      }

      // Pick the most frequently used (categoryType, itemName) for each merchant
      const merchantBestItem: Record<string, { categoryType: string; itemName: string }> = {};
      for (const [merchant, counts] of Object.entries(merchantItemCounts)) {
        let maxCount = 0;
        let bestKey = '';
        for (const [key, count] of Object.entries(counts)) {
          if (count > maxCount) {
            maxCount = count;
            bestKey = key;
          }
        }
        if (bestKey) {
          const [categoryType, itemName] = bestKey.split('|');
          merchantBestItem[merchant] = { categoryType, itemName };
        }
      }

      // Now look up the current month's budget to find matching items
      const currentBudget = await db.query.budgets.findFirst({
        where: and(
          eq(budgets.userId, userId),
          eq(budgets.month, currentMonth),
          eq(budgets.year, currentYear)
        ),
        with: {
          categories: {
            with: {
              items: true,
            },
          },
        },
      });

      if (currentBudget) {
        // Build a lookup: (categoryType, itemName) -> current month's item ID
        const currentItemLookup: Record<string, string> = {};
        for (const category of currentBudget.categories) {
          for (const item of category.items) {
            const key = `${category.categoryType}|${item.name.toLowerCase()}`;
            currentItemLookup[key] = item.id;
          }
        }

        // Map merchants to current month's item IDs
        for (const [merchant, { categoryType, itemName }] of Object.entries(merchantBestItem)) {
          const key = `${categoryType}|${itemName.toLowerCase()}`;
          if (currentItemLookup[key]) {
            merchantSuggestions[merchant] = currentItemLookup[key];
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
