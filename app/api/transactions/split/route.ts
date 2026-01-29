import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { transactions, splitTransactions, budgetItems, linkedAccounts } from '@/db/schema';
import { eq, and } from 'drizzle-orm';
import { requireAuth, isAuthError } from '@/lib/auth';

interface SplitItem {
  budgetItemId: number;
  amount: number;
  description?: string;
}

// Helper to verify transaction ownership (via budgetItem, linkedAccount, or split transactions)
async function verifyTransactionOwnership(transactionId: number, userId: string): Promise<boolean> {
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

  if (txn.budgetItem?.category?.budget?.userId === userId) return true;
  if (txn.linkedAccount?.userId === userId) return true;

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

// Helper to verify budget item ownership
async function verifyBudgetItemOwnership(budgetItemId: number, userId: string): Promise<boolean> {
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

// POST - Create splits for a transaction
export async function POST(request: NextRequest) {
  try {
    const authResult = await requireAuth();
    if (isAuthError(authResult)) return authResult.error;
    const { userId } = authResult;

    const body = await request.json();
    const { transactionId, splits } = body as { transactionId: number; splits: SplitItem[] };

    if (!transactionId || !splits || !Array.isArray(splits) || splits.length === 0) {
      return NextResponse.json({ error: 'Missing transactionId or splits' }, { status: 400 });
    }

    // Verify transaction ownership
    if (!(await verifyTransactionOwnership(transactionId, userId))) {
      return NextResponse.json({ error: 'Transaction not found' }, { status: 404 });
    }

    // Verify ownership of all budget items in splits
    for (const split of splits) {
      if (!(await verifyBudgetItemOwnership(split.budgetItemId, userId))) {
        return NextResponse.json({ error: 'Budget item not found' }, { status: 404 });
      }
    }

    // Get the parent transaction
    const [parentTxn] = await db
      .select()
      .from(transactions)
      .where(eq(transactions.id, transactionId))
      .limit(1);

    if (!parentTxn) {
      return NextResponse.json({ error: 'Transaction not found' }, { status: 404 });
    }

    // Validate splits sum to parent amount
    const splitTotal = splits.reduce((sum, s) => sum + s.amount, 0);
    if (Math.abs(splitTotal - parentTxn.amount) > 0.01) {
      return NextResponse.json({
        error: `Split amounts (${splitTotal.toFixed(2)}) must equal transaction amount (${parentTxn.amount.toFixed(2)})`
      }, { status: 400 });
    }

    // Delete any existing splits for this transaction
    await db
      .delete(splitTransactions)
      .where(eq(splitTransactions.parentTransactionId, transactionId));

    // Clear the parent's budgetItemId since it's now split
    await db
      .update(transactions)
      .set({ budgetItemId: null })
      .where(eq(transactions.id, transactionId));

    // Insert new splits
    const createdSplits = [];
    for (const split of splits) {
      const [created] = await db
        .insert(splitTransactions)
        .values({
          parentTransactionId: transactionId,
          budgetItemId: split.budgetItemId,
          amount: split.amount,
          description: split.description || null,
        })
        .returning();
      createdSplits.push(created);
    }

    return NextResponse.json({
      success: true,
      splits: createdSplits
    });
  } catch (error) {
    console.error('Error creating split transaction:', error);
    return NextResponse.json({ error: 'Failed to create split transaction' }, { status: 500 });
  }
}

// GET - Get splits for a transaction
export async function GET(request: NextRequest) {
  try {
    const authResult = await requireAuth();
    if (isAuthError(authResult)) return authResult.error;
    const { userId } = authResult;

    const { searchParams } = new URL(request.url);
    const transactionId = searchParams.get('transactionId');

    if (!transactionId) {
      return NextResponse.json({ error: 'Missing transactionId' }, { status: 400 });
    }

    // Verify transaction ownership
    if (!(await verifyTransactionOwnership(parseInt(transactionId), userId))) {
      return NextResponse.json({ error: 'Transaction not found' }, { status: 404 });
    }

    const splits = await db
      .select()
      .from(splitTransactions)
      .where(eq(splitTransactions.parentTransactionId, parseInt(transactionId)));

    return NextResponse.json(splits);
  } catch (error) {
    console.error('Error fetching split transactions:', error);
    return NextResponse.json({ error: 'Failed to fetch split transactions' }, { status: 500 });
  }
}

// DELETE - Remove splits and optionally assign to a single budget item (unsplit)
export async function DELETE(request: NextRequest) {
  try {
    const authResult = await requireAuth();
    if (isAuthError(authResult)) return authResult.error;
    const { userId } = authResult;

    const { searchParams } = new URL(request.url);
    const transactionId = searchParams.get('transactionId');
    const budgetItemId = searchParams.get('budgetItemId'); // Optional: assign to this item after unsplitting

    if (!transactionId) {
      return NextResponse.json({ error: 'Missing transactionId' }, { status: 400 });
    }

    // Verify transaction ownership
    if (!(await verifyTransactionOwnership(parseInt(transactionId), userId))) {
      return NextResponse.json({ error: 'Transaction not found' }, { status: 404 });
    }

    // If budgetItemId provided, verify ownership
    if (budgetItemId && !(await verifyBudgetItemOwnership(parseInt(budgetItemId), userId))) {
      return NextResponse.json({ error: 'Budget item not found' }, { status: 404 });
    }

    // Delete all splits
    await db
      .delete(splitTransactions)
      .where(eq(splitTransactions.parentTransactionId, parseInt(transactionId)));

    // If budgetItemId provided, assign transaction to that item
    if (budgetItemId) {
      await db
        .update(transactions)
        .set({ budgetItemId: parseInt(budgetItemId) })
        .where(eq(transactions.id, parseInt(transactionId)));
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error removing split transaction:', error);
    return NextResponse.json({ error: 'Failed to remove split transaction' }, { status: 500 });
  }
}
