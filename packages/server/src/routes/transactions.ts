import { Hono } from 'hono';
import { getDb } from '@budget-app/shared/db';
import { transactions, budgetItems, linkedAccounts, splitTransactions } from '@budget-app/shared/schema';
import { eq, isNotNull, inArray } from 'drizzle-orm';
import { getUserId } from '../middleware/auth';
import type { AppEnv } from '../types';

// Helper to verify budget item ownership
async function verifyBudgetItemOwnership(budgetItemId: string, userId: string): Promise<boolean> {
  const db = await getDb();
  const item = await db.query.budgetItems.findFirst({
    where: eq(budgetItems.id, budgetItemId),
    with: {
      category: {
        with: { budget: true },
      },
    },
  });
  return item?.category?.budget?.userId === userId;
}

// Helper to verify transaction ownership (via budgetItem, linkedAccount, or split transactions)
async function verifyTransactionOwnership(transactionId: string, userId: string): Promise<boolean> {
  const db = await getDb();
  const txn = await db.query.transactions.findFirst({
    where: eq(transactions.id, transactionId),
    with: {
      budgetItem: {
        with: {
          category: {
            with: { budget: true },
          },
        },
      },
      linkedAccount: true,
    },
  });

  if (!txn) return false;

  // Check via budget item path
  if (txn.budgetItem?.category?.budget?.userId === userId) {
    return true;
  }

  // Check via linked account path
  if (txn.linkedAccount?.userId === userId) {
    return true;
  }

  // Check via split transactions (parent has null budgetItemId after splitting)
  const splits = await db.query.splitTransactions.findMany({
    where: eq(splitTransactions.parentTransactionId, transactionId),
    with: {
      budgetItem: {
        with: {
          category: {
            with: { budget: true },
          },
        },
      },
    },
  });

  for (const split of splits) {
    if (split.budgetItem?.category?.budget?.userId === userId) {
      return true;
    }
  }

  return false;
}

interface SplitItem {
  budgetItemId: string;
  amount: number;
  description?: string;
}

interface AssignmentRequest {
  transactionId: string;
  budgetItemId: string;
}

const route = new Hono<AppEnv>();

// ============================================================================
// MAIN TRANSACTION HANDLERS
// ============================================================================

// POST / - Create a new transaction
route.post('/', async (c) => {
  const userId = getUserId(c);
  const db = await getDb();
  const body = await c.req.json();
  const { budgetItemId, linkedAccountId, date, description, amount, type, merchant, checkNumber } = body;

  if (!budgetItemId || !date || !description || amount === undefined || !type) {
    return c.json({ error: 'Missing required fields' }, 400);
  }

  // Verify budget item ownership
  if (!(await verifyBudgetItemOwnership(budgetItemId, userId))) {
    return c.json({ error: 'Budget item not found' }, 404);
  }

  // Verify linked account ownership if provided
  if (linkedAccountId) {
    const account = await db.query.linkedAccounts.findFirst({
      where: eq(linkedAccounts.id, linkedAccountId),
    });
    if (!account || account.userId !== userId) {
      return c.json({ error: 'Linked account not found' }, 404);
    }
  }

  const [transaction] = await db
    .insert(transactions)
    .values({
      budgetItemId,
      linkedAccountId: linkedAccountId || null,
      date,
      description,
      amount,
      type,
      merchant: merchant || null,
      checkNumber: checkNumber || null,
    })
    .returning();

  return c.json(transaction);
});

// PUT / - Update transaction
route.put('/', async (c) => {
  const userId = getUserId(c);
  const db = await getDb();
  const body = await c.req.json();
  const { id, budgetItemId, linkedAccountId, date, description, amount, type, merchant, isTransfer } = body;

  if (!id) {
    return c.json({ error: 'Missing transaction id' }, 400);
  }

  // Verify transaction ownership
  if (!(await verifyTransactionOwnership(id, userId))) {
    return c.json({ error: 'Transaction not found' }, 404);
  }

  // If updating budgetItemId, verify ownership of the new budget item
  if (budgetItemId && !(await verifyBudgetItemOwnership(budgetItemId, userId))) {
    return c.json({ error: 'Budget item not found' }, 404);
  }

  // Build update object with only provided fields
  const updateData: Record<string, unknown> = { updatedAt: new Date() };
  if (budgetItemId !== undefined) updateData.budgetItemId = budgetItemId || null;
  if (linkedAccountId !== undefined) updateData.linkedAccountId = linkedAccountId || null;
  if (date !== undefined) updateData.date = date;
  if (description !== undefined) updateData.description = description;
  if (amount !== undefined) updateData.amount = amount;
  if (type !== undefined) updateData.type = type;
  if (merchant !== undefined) updateData.merchant = merchant || null;
  if (isTransfer !== undefined) updateData.isTransfer = !!isTransfer;

  const result = await db
    .update(transactions)
    .set(updateData)
    .where(eq(transactions.id, id))
    .returning();

  if (result.length === 0) {
    return c.json({ error: 'Transaction not found or update failed' }, 404);
  }

  return c.json(result[0]);
});

// DELETE / - Soft delete a transaction
route.delete('/', async (c) => {
  const userId = getUserId(c);
  const db = await getDb();
  const id = c.req.query('id');

  if (!id) {
    return c.json({ error: 'Missing transaction id' }, 400);
  }

  if (!(await verifyTransactionOwnership(id, userId))) {
    return c.json({ error: 'Transaction not found' }, 404);
  }

  await db
    .update(transactions)
    .set({ deletedAt: new Date(), updatedAt: new Date() })
    .where(eq(transactions.id, id));

  return c.json({ success: true });
});

// GET / - Get a single transaction by ID or deleted transactions for a month/year
route.get('/', async (c) => {
  const userId = getUserId(c);
  const db = await getDb();
  const id = c.req.query('id');
  const month = c.req.query('month');
  const year = c.req.query('year');
  const deleted = c.req.query('deleted');

  // Fetch single transaction by ID
  if (id) {
    if (!(await verifyTransactionOwnership(id, userId))) {
      return c.json({ error: 'Transaction not found' }, 404);
    }

    const [transaction] = await db
      .select()
      .from(transactions)
      .where(eq(transactions.id, id));

    if (!transaction) {
      return c.json({ error: 'Transaction not found' }, 404);
    }

    return c.json({
      id: transaction.id.toString(),
      budgetItemId: transaction.budgetItemId?.toString() || null,
      linkedAccountId: transaction.linkedAccountId,
      date: transaction.date,
      description: transaction.description,
      amount: transaction.amount,
      type: transaction.type,
      merchant: transaction.merchant,
    });
  }

  // Only return deleted transactions if explicitly requested
  if (deleted === 'true') {
    const deletedTransactions = await db.query.transactions.findMany({
      where: isNotNull(transactions.deletedAt),
      with: {
        budgetItem: {
          with: {
            category: {
              with: { budget: true },
            },
          },
        },
        linkedAccount: true,
      },
    });

    // Filter by ownership
    const ownedTransactions = deletedTransactions.filter(txn => {
      if (txn.budgetItem?.category?.budget?.userId === userId) return true;
      if (txn.linkedAccount?.userId === userId) return true;
      return false;
    });

    // Filter by month/year if provided
    let filtered = ownedTransactions;
    if (month !== undefined && year !== undefined) {
      const monthNum = parseInt(month);
      const yearNum = parseInt(year);
      filtered = ownedTransactions.filter(txn => {
        const [txnYear, txnMonth] = txn.date.split('-').map(Number);
        return (txnMonth - 1) === monthNum && txnYear === yearNum;
      });
    }

    const result = filtered.map(txn => ({
      id: txn.id,
      budgetItemId: txn.budgetItemId,
      linkedAccountId: txn.linkedAccountId,
      date: txn.date,
      description: txn.description,
      amount: txn.amount,
      type: txn.type,
      merchant: txn.merchant,
      deletedAt: txn.deletedAt,
    }));

    return c.json(result);
  }

  return c.json({ error: 'Invalid request' }, 400);
});

// PATCH / - Restore a soft-deleted transaction
route.patch('/', async (c) => {
  const userId = getUserId(c);
  const db = await getDb();
  const body = await c.req.json();
  const { id } = body;

  if (!id) {
    return c.json({ error: 'Missing transaction id' }, 400);
  }

  if (!(await verifyTransactionOwnership(id, userId))) {
    return c.json({ error: 'Transaction not found' }, 404);
  }

  const [restored] = await db
    .update(transactions)
    .set({ deletedAt: null, updatedAt: new Date() })
    .where(eq(transactions.id, id))
    .returning();

  return c.json(restored);
});

// ============================================================================
// SPLIT TRANSACTION HANDLERS
// ============================================================================

// POST /split - Create splits for a transaction
route.post('/split', async (c) => {
  try {
    const userId = getUserId(c);
    const db = await getDb();
    const body = await c.req.json();
    const { transactionId, splits } = body as { transactionId: string; splits: SplitItem[] };

    if (!transactionId || !splits || !Array.isArray(splits) || splits.length === 0) {
      return c.json({ error: 'Missing transactionId or splits' }, 400);
    }

    // Verify transaction ownership
    if (!(await verifyTransactionOwnership(transactionId, userId))) {
      return c.json({ error: 'Transaction not found' }, 404);
    }

    // Verify ownership of all budget items in splits
    for (const split of splits) {
      if (!(await verifyBudgetItemOwnership(split.budgetItemId, userId))) {
        return c.json({ error: 'Budget item not found' }, 404);
      }
    }

    // Get the parent transaction
    const [parentTxn] = await db
      .select()
      .from(transactions)
      .where(eq(transactions.id, transactionId))
      .limit(1);

    if (!parentTxn) {
      return c.json({ error: 'Transaction not found' }, 404);
    }

    // Validate splits sum to parent amount
    const splitTotal = splits.reduce((sum, s) => sum + s.amount, 0);
    const parentAmount = parseFloat(String(parentTxn.amount));
    if (Math.abs(splitTotal - parentAmount) > 0.01) {
      return c.json({
        error: `Split amounts (${splitTotal.toFixed(2)}) must equal transaction amount (${parentAmount.toFixed(2)})`
      }, 400);
    }

    // Delete any existing splits for this transaction
    await db
      .delete(splitTransactions)
      .where(eq(splitTransactions.parentTransactionId, transactionId));

    // Clear the parent's budgetItemId since it's now split
    await db
      .update(transactions)
      .set({ budgetItemId: null, updatedAt: new Date() })
      .where(eq(transactions.id, transactionId));

    // Insert new splits
    const createdSplits = [];
    for (const split of splits) {
      const [created] = await db
        .insert(splitTransactions)
        .values({
          parentTransactionId: transactionId,
          budgetItemId: split.budgetItemId,
          amount: String(split.amount),
          description: split.description || null,
        })
        .returning();
      createdSplits.push(created);
    }

    return c.json({
      success: true,
      splits: createdSplits
    });
  } catch (error) {
    console.error('Error creating split transaction:', error);
    return c.json({ error: 'Failed to create split transaction' }, 500);
  }
});

// GET /split - Get splits for a transaction
route.get('/split', async (c) => {
  try {
    const userId = getUserId(c);
    const db = await getDb();
    const transactionId = c.req.query('transactionId');

    if (!transactionId) {
      return c.json({ error: 'Missing transactionId' }, 400);
    }

    if (!(await verifyTransactionOwnership(transactionId, userId))) {
      return c.json({ error: 'Transaction not found' }, 404);
    }

    const splits = await db
      .select()
      .from(splitTransactions)
      .where(eq(splitTransactions.parentTransactionId, transactionId));

    return c.json(splits);
  } catch (error) {
    console.error('Error fetching split transactions:', error);
    return c.json({ error: 'Failed to fetch split transactions' }, 500);
  }
});

// DELETE /split - Remove splits and optionally assign to a single budget item (unsplit)
route.delete('/split', async (c) => {
  try {
    const userId = getUserId(c);
    const db = await getDb();
    const transactionId = c.req.query('transactionId');
    const budgetItemId = c.req.query('budgetItemId');

    if (!transactionId) {
      return c.json({ error: 'Missing transactionId' }, 400);
    }

    if (!(await verifyTransactionOwnership(transactionId, userId))) {
      return c.json({ error: 'Transaction not found' }, 404);
    }

    if (budgetItemId && !(await verifyBudgetItemOwnership(budgetItemId, userId))) {
      return c.json({ error: 'Budget item not found' }, 404);
    }

    // Delete all splits
    await db
      .delete(splitTransactions)
      .where(eq(splitTransactions.parentTransactionId, transactionId));

    // If budgetItemId provided, assign transaction to that item
    if (budgetItemId) {
      await db
        .update(transactions)
        .set({ budgetItemId, updatedAt: new Date() })
        .where(eq(transactions.id, transactionId));
    }

    return c.json({ success: true });
  } catch (error) {
    console.error('Error removing split transaction:', error);
    return c.json({ error: 'Failed to remove split transaction' }, 500);
  }
});

// ============================================================================
// BATCH ASSIGN HANDLER
// ============================================================================

// POST /batch-assign - Batch assign multiple transactions to budget items
route.post('/batch-assign', async (c) => {
  const userId = getUserId(c);
  const db = await getDb();
  const body = await c.req.json();
  const { assignments } = body as { assignments: AssignmentRequest[] };

  if (!assignments || !Array.isArray(assignments) || assignments.length === 0) {
    return c.json({ error: 'No assignments provided' }, 400);
  }

  // Get unique budget item IDs and transaction IDs
  const budgetItemIds = [...new Set(assignments.map(a => a.budgetItemId))];
  const transactionIds = [...new Set(assignments.map(a => a.transactionId))];

  // Verify all budget items belong to the user
  const budgetItemsResult = await db.query.budgetItems.findMany({
    where: inArray(budgetItems.id, budgetItemIds),
    with: {
      category: {
        with: { budget: true },
      },
    },
  });

  const ownedBudgetItemIds = new Set(
    budgetItemsResult
      .filter(item => item.category?.budget?.userId === userId)
      .map(item => item.id)
  );

  // Verify all transactions belong to the user (via linked account)
  const userAccounts = await db
    .select({ id: linkedAccounts.id })
    .from(linkedAccounts)
    .where(eq(linkedAccounts.userId, userId));
  const userAccountIds = new Set(userAccounts.map(a => a.id));

  const txnsResult = await db.query.transactions.findMany({
    where: inArray(transactions.id, transactionIds),
    with: {
      linkedAccount: true,
    },
  });

  const ownedTransactionIds = new Set(
    txnsResult
      .filter(txn => txn.linkedAccount && userAccountIds.has(txn.linkedAccount.id))
      .map(txn => txn.id)
  );

  // Filter to only valid assignments (user owns both transaction and budget item)
  const validAssignments = assignments.filter(
    a => ownedTransactionIds.has(a.transactionId) && ownedBudgetItemIds.has(a.budgetItemId)
  );

  if (validAssignments.length === 0) {
    return c.json({
      error: 'No valid assignments found',
      assigned: 0,
      skipped: assignments.length,
    }, 400);
  }

  // Perform the batch update
  let assigned = 0;
  const errors: string[] = [];

  for (const assignment of validAssignments) {
    try {
      await db
        .update(transactions)
        .set({ budgetItemId: assignment.budgetItemId, updatedAt: new Date() })
        .where(eq(transactions.id, assignment.transactionId));
      assigned++;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      errors.push(`Transaction ${assignment.transactionId}: ${errorMsg}`);
    }
  }

  return c.json({
    assigned,
    skipped: assignments.length - validAssignments.length,
    errors: errors.length > 0 ? errors : undefined,
  });
});

export default route;
