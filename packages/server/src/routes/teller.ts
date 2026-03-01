import { Hono } from 'hono';
import { getDb } from '@budget-app/shared/db';
import { linkedAccounts, transactions, splitTransactions, budgets, budgetCategories, budgetItems } from '@budget-app/shared/schema';
import { eq, and, isNull, isNotNull, notInArray, inArray } from 'drizzle-orm';
import { getUserId } from '../middleware/auth';
import { createTellerClient } from '../lib/teller';
import type { TellerAccount, TellerTransaction } from '../lib/teller';
import type { AppEnv } from '../types';

const route = new Hono<AppEnv>();

// ============================================================================
// ACCOUNTS
// ============================================================================

// GET /accounts - List all linked Teller accounts from database
route.get('/accounts', async (c) => {
  try {
    const userId = getUserId(c);
    const db = await getDb();
    // Only return Teller accounts (not CSV accounts)
    const accounts = await db.select().from(linkedAccounts).where(
      and(eq(linkedAccounts.userId, userId), eq(linkedAccounts.accountSource, 'teller'), isNull(linkedAccounts.deletedAt))
    );
    return c.json(accounts);
  } catch (error) {
    console.error('Error fetching linked accounts:', error);
    return c.json({ error: 'Failed to fetch linked accounts' }, 500);
  }
});

// POST /accounts - Save a new linked account after Teller Connect enrollment
route.post('/accounts', async (c) => {
  try {
    const userId = getUserId(c);
    const db = await getDb();
    const body = await c.req.json();
    const { accessToken, enrollment } = body;

    if (!accessToken) {
      return c.json({ error: 'Access token is required' }, 400);
    }

    // Fetch accounts from Teller API using the access token
    const tellerClient = createTellerClient(accessToken);
    const tellerAccounts: TellerAccount[] = await tellerClient.listAccounts();

    // Save each account to the database
    const savedAccounts = [];
    for (const account of tellerAccounts) {
      // Check if account already exists for this user
      const existing = await db
        .select()
        .from(linkedAccounts)
        .where(and(eq(linkedAccounts.tellerAccountId, account.id), eq(linkedAccounts.userId, userId)))
        .limit(1);

      if (existing.length > 0) {
        // Update existing account
        await db
          .update(linkedAccounts)
          .set({
            accessToken,
            institutionName: account.institution.name,
            accountName: account.name,
            status: account.status,
            updatedAt: new Date(),
          })
          .where(eq(linkedAccounts.tellerAccountId, account.id));
        savedAccounts.push({ ...existing[0], updated: true });
      } else {
        // Insert new account
        const [newAccount] = await db
          .insert(linkedAccounts)
          .values({
            userId,
            tellerAccountId: account.id,
            tellerEnrollmentId: enrollment?.id || account.enrollment_id,
            accessToken,
            institutionName: account.institution.name,
            institutionId: account.institution.id,
            accountName: account.name,
            accountType: account.type,
            accountSubtype: account.subtype,
            lastFour: account.last_four,
            status: account.status,
          })
          .returning();
        savedAccounts.push(newAccount);
      }
    }

    return c.json({ accounts: savedAccounts });
  } catch (error) {
    console.error('Error saving linked account:', error);
    return c.json({ error: 'Failed to save linked account' }, 500);
  }
});

// DELETE /accounts - Remove a linked account
route.delete('/accounts', async (c) => {
  try {
    const userId = getUserId(c);
    const db = await getDb();
    const id = c.req.query('id');

    if (!id) {
      return c.json({ error: 'Account ID is required' }, 400);
    }

    // Get the account and verify ownership
    const [account] = await db
      .select()
      .from(linkedAccounts)
      .where(and(eq(linkedAccounts.id, id), eq(linkedAccounts.userId, userId)))
      .limit(1);

    if (!account) {
      return c.json({ error: 'Account not found' }, 404);
    }

    // Optionally disconnect from Teller (revoke access) - only for Teller accounts
    if (account.accessToken && account.tellerAccountId) {
      try {
        const tellerClient = createTellerClient(account.accessToken);
        await tellerClient.deleteAccount(account.tellerAccountId);
      } catch {
        // Continue even if Teller API fails - we still want to remove from our DB
        console.warn('Failed to disconnect account from Teller API');
      }
    }

    // Soft delete from database
    await db.update(linkedAccounts)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(eq(linkedAccounts.id, id));

    return c.json({ success: true });
  } catch (error) {
    console.error('Error deleting linked account:', error);
    return c.json({ error: 'Failed to delete linked account' }, 500);
  }
});

// ============================================================================
// SYNC
// ============================================================================

// POST /sync - Sync transactions from linked accounts
route.post('/sync', async (c) => {
  try {
    const userId = getUserId(c);
    const db = await getDb();
    const body = await c.req.json();
    const { accountId, startDate, endDate } = body;

    // Get linked Teller accounts to sync (scoped to user, only Teller accounts)
    let accountsToSync;
    if (accountId) {
      accountsToSync = await db
        .select()
        .from(linkedAccounts)
        .where(and(
          eq(linkedAccounts.id, accountId),
          eq(linkedAccounts.userId, userId),
          eq(linkedAccounts.accountSource, 'teller')
        ));
    } else {
      accountsToSync = await db.select().from(linkedAccounts).where(
        and(eq(linkedAccounts.userId, userId), eq(linkedAccounts.accountSource, 'teller'))
      );
    }

    if (accountsToSync.length === 0) {
      return c.json({ error: 'No linked accounts found' }, 404);
    }

    const results = {
      synced: 0,
      updated: 0,
      skipped: 0,
      errors: [] as string[],
    };

    for (const account of accountsToSync) {
      if (!account.accessToken || !account.tellerAccountId) {
        results.errors.push(`Account ${account.accountName}: Missing Teller credentials`);
        continue;
      }

      try {
        const tellerClient = createTellerClient(account.accessToken);

        const tellerTransactions: TellerTransaction[] = await tellerClient.listTransactions(
          account.tellerAccountId,
          {
            count: 500,
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
          .set({ lastSyncedAt: new Date(), updatedAt: new Date() })
          .where(eq(linkedAccounts.id, account.id));

      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Unknown error';
        results.errors.push(`Account ${account.accountName}: ${errorMsg}`);
      }
    }

    return c.json(results);
  } catch (error) {
    console.error('Error syncing transactions:', error);
    return c.json({ error: 'Failed to sync transactions' }, 500);
  }
});

// GET /sync - Get uncategorized transactions (not assigned to any budget item)
route.get('/sync', async (c) => {
  try {
    const userId = getUserId(c);
    const db = await getDb();

    const monthParam = c.req.query('month');
    const yearParam = c.req.query('year');
    const currentMonth = monthParam !== undefined ? parseInt(monthParam) : new Date().getMonth();
    const currentYear = yearParam !== undefined ? parseInt(yearParam) : new Date().getFullYear();

    // Get user's linked account IDs for filtering
    const userAccounts = await db
      .select({ id: linkedAccounts.id })
      .from(linkedAccounts)
      .where(eq(linkedAccounts.userId, userId));
    const userAccountIds = userAccounts.map(a => a.id);

    if (userAccountIds.length === 0) {
      return c.json([]);
    }

    // Get IDs of transactions that have been split
    const splitParentIds = await db
      .selectDistinct({ parentId: splitTransactions.parentTransactionId })
      .from(splitTransactions);
    const splitParentIdList = splitParentIds.map(s => s.parentId);

    // Get uncategorized, non-deleted, non-split transactions
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

      // Look up the current month's budget to find matching items
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
        const currentItemLookup: Record<string, string> = {};
        for (const category of currentBudget.categories) {
          for (const item of category.items) {
            const key = `${category.categoryType}|${item.name.toLowerCase()}`;
            currentItemLookup[key] = item.id;
          }
        }

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

    return c.json(result);
  } catch (error) {
    console.error('Error fetching uncategorized transactions:', error);
    return c.json({ error: 'Failed to fetch uncategorized transactions' }, 500);
  }
});

export default route;
