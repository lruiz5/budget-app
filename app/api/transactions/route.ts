import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { transactions, budgetItems, linkedAccounts } from '@/db/schema';
import { eq, isNotNull, and } from 'drizzle-orm';
import { requireAuth, isAuthError } from '@/lib/auth';
import { splitTransactions } from '@/db/schema';

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

export async function POST(request: NextRequest) {
  const authResult = await requireAuth();
  if (isAuthError(authResult)) return authResult.error;
  const { userId } = authResult;

  const body = await request.json();
  const { budgetItemId, linkedAccountId, date, description, amount, type, merchant, checkNumber } = body;

  if (!budgetItemId || !date || !description || amount === undefined || !type) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }

  // Verify budget item ownership
  if (!(await verifyBudgetItemOwnership(parseInt(budgetItemId), userId))) {
    return NextResponse.json({ error: 'Budget item not found' }, { status: 404 });
  }

  // Verify linked account ownership if provided
  if (linkedAccountId) {
    const account = await db.query.linkedAccounts.findFirst({
      where: and(eq(linkedAccounts.id, parseInt(linkedAccountId)), eq(linkedAccounts.userId, userId)),
    });
    if (!account) {
      return NextResponse.json({ error: 'Linked account not found' }, { status: 404 });
    }
  }

  const [transaction] = await db
    .insert(transactions)
    .values({
      budgetItemId: parseInt(budgetItemId),
      linkedAccountId: linkedAccountId ? parseInt(linkedAccountId) : null,
      date,
      description,
      amount,
      type,
      merchant: merchant || null,
      checkNumber: checkNumber || null,
    })
    .returning();

  return NextResponse.json(transaction);
}

// PUT - Update transaction (full edit or just assign budget item)
export async function PUT(request: NextRequest) {
  const authResult = await requireAuth();
  if (isAuthError(authResult)) return authResult.error;
  const { userId } = authResult;

  const body = await request.json();
  const { id, budgetItemId, linkedAccountId, date, description, amount, type, merchant } = body;

  if (!id) {
    return NextResponse.json({ error: 'Missing transaction id' }, { status: 400 });
  }

  // Verify transaction ownership
  if (!(await verifyTransactionOwnership(parseInt(id), userId))) {
    return NextResponse.json({ error: 'Transaction not found' }, { status: 404 });
  }

  // If updating budgetItemId, verify ownership of the new budget item
  if (budgetItemId && !(await verifyBudgetItemOwnership(parseInt(budgetItemId), userId))) {
    return NextResponse.json({ error: 'Budget item not found' }, { status: 404 });
  }

  // Build update object with only provided fields
  const updateData: Record<string, unknown> = {};

  if (budgetItemId !== undefined) {
    updateData.budgetItemId = budgetItemId ? parseInt(budgetItemId) : null;
  }
  if (linkedAccountId !== undefined) {
    updateData.linkedAccountId = linkedAccountId ? parseInt(linkedAccountId) : null;
  }
  if (date !== undefined) {
    updateData.date = date;
  }
  if (description !== undefined) {
    updateData.description = description;
  }
  if (amount !== undefined) {
    updateData.amount = amount;
  }
  if (type !== undefined) {
    updateData.type = type;
  }
  if (merchant !== undefined) {
    updateData.merchant = merchant || null;
  }

  const [updated] = await db
    .update(transactions)
    .set(updateData)
    .where(eq(transactions.id, parseInt(id)))
    .returning();

  return NextResponse.json(updated);
}

// DELETE - Soft delete a transaction
export async function DELETE(request: NextRequest) {
  const authResult = await requireAuth();
  if (isAuthError(authResult)) return authResult.error;
  const { userId } = authResult;

  const searchParams = request.nextUrl.searchParams;
  const id = searchParams.get('id');

  if (!id) {
    return NextResponse.json({ error: 'Missing transaction id' }, { status: 400 });
  }

  // Verify transaction ownership
  if (!(await verifyTransactionOwnership(parseInt(id), userId))) {
    return NextResponse.json({ error: 'Transaction not found' }, { status: 404 });
  }

  // Soft delete by setting deletedAt timestamp
  await db
    .update(transactions)
    .set({ deletedAt: new Date() })
    .where(eq(transactions.id, parseInt(id)));

  return NextResponse.json({ success: true });
}

// GET - Get a single transaction by ID or deleted transactions for a month/year
export async function GET(request: NextRequest) {
  const authResult = await requireAuth();
  if (isAuthError(authResult)) return authResult.error;
  const { userId } = authResult;

  const searchParams = request.nextUrl.searchParams;
  const id = searchParams.get('id');
  const month = searchParams.get('month');
  const year = searchParams.get('year');
  const deleted = searchParams.get('deleted');

  // Fetch single transaction by ID
  if (id) {
    // Verify ownership before returning
    if (!(await verifyTransactionOwnership(parseInt(id), userId))) {
      return NextResponse.json({ error: 'Transaction not found' }, { status: 404 });
    }

    const [transaction] = await db
      .select()
      .from(transactions)
      .where(eq(transactions.id, parseInt(id)));

    if (!transaction) {
      return NextResponse.json({ error: 'Transaction not found' }, { status: 404 });
    }

    return NextResponse.json({
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
    // Get all deleted transactions and filter by ownership
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
    if (month !== null && year !== null) {
      const monthNum = parseInt(month);
      const yearNum = parseInt(year);
      filtered = ownedTransactions.filter(txn => {
        const [txnYear, txnMonth] = txn.date.split('-').map(Number);
        return (txnMonth - 1) === monthNum && txnYear === yearNum;
      });
    }

    // Map to simpler format
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

    return NextResponse.json(result);
  }

  return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
}

// PATCH - Restore a soft-deleted transaction
export async function PATCH(request: NextRequest) {
  const authResult = await requireAuth();
  if (isAuthError(authResult)) return authResult.error;
  const { userId } = authResult;

  const body = await request.json();
  const { id } = body;

  if (!id) {
    return NextResponse.json({ error: 'Missing transaction id' }, { status: 400 });
  }

  // Verify transaction ownership
  if (!(await verifyTransactionOwnership(parseInt(id), userId))) {
    return NextResponse.json({ error: 'Transaction not found' }, { status: 404 });
  }

  // Restore by clearing deletedAt
  const [restored] = await db
    .update(transactions)
    .set({ deletedAt: null })
    .where(eq(transactions.id, parseInt(id)))
    .returning();

  return NextResponse.json(restored);
}
