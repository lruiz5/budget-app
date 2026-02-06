import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/db';
import { recurringPayments, budgetItems, transactions, splitTransactions } from '@/db/schema';
import { eq, desc, and, isNull } from 'drizzle-orm';
import { RecurringPayment, RecurringFrequency, CategoryType } from '@/types/budget';
import { requireAuth, isAuthError } from '@/lib/auth';

// Helper to calculate months in a frequency cycle (for expense accumulation)
function getMonthsInCycle(frequency: RecurringFrequency): number {
  switch (frequency) {
    case 'monthly': return 1;
    case 'quarterly': return 3;
    case 'semi-annually': return 6;
    case 'annually': return 12;
    default: return 1;
  }
}

// Helper to calculate the monthly equivalent amount
// For income: how much you expect per month (e.g., bi-weekly $1,937 → monthly $3,875)
// For expenses: how much to set aside per month (e.g., quarterly $600 → monthly $200)
function getMonthlyEquivalent(amount: number, frequency: RecurringFrequency): number {
  switch (frequency) {
    case 'weekly': return amount * 4;
    case 'bi-weekly': return amount * 2;
    case 'monthly': return amount;
    case 'quarterly': return amount / 3;
    case 'semi-annually': return amount / 6;
    case 'annually': return amount / 12;
    default: return amount;
  }
}

// Helper to calculate days until due (parse YYYY-MM-DD as local to avoid UTC shift)
function getDaysUntilDue(nextDueDate: string): number {
  const [y, m, d] = nextDueDate.split('-').map(Number);
  const due = new Date(y, m - 1, d);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  due.setHours(0, 0, 0, 0);
  const diffTime = due.getTime() - today.getTime();
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
}

// Transform DB record to RecurringPayment with computed fields
function transformToRecurringPayment(
  record: typeof recurringPayments.$inferSelect,
  calculatedFundedAmount?: number,
  isMonthly?: boolean,
  isIncome?: boolean
): RecurringPayment {
  const frequency = record.frequency as RecurringFrequency;
  const monthsInCycle = getMonthsInCycle(frequency);
  const amountNum = parseFloat(String(record.amount));

  // Use calculated funded amount from transactions if provided, otherwise use DB value
  const fundedAmount = calculatedFundedAmount !== undefined ? calculatedFundedAmount : parseFloat(String(record.fundedAmount));

  let monthlyContribution: number;
  let displayTarget: number;

  if (isIncome) {
    // Income: target is the monthly equivalent (e.g., bi-weekly $1,937 → $3,875/month)
    // Income is received, not accumulated — each month is independent
    monthlyContribution = getMonthlyEquivalent(amountNum, frequency);
    displayTarget = monthlyContribution;
  } else if (isMonthly) {
    // Monthly expense: target is the per-month amount
    monthlyContribution = amountNum / monthsInCycle; // = amountNum
    displayTarget = monthlyContribution;
  } else {
    // Non-monthly expense: accumulate toward the total cycle amount
    monthlyContribution = amountNum / monthsInCycle;
    displayTarget = amountNum;
  }

  const percentFunded = displayTarget > 0 ? (fundedAmount / displayTarget) * 100 : 0;
  const isPaid = fundedAmount >= displayTarget;

  return {
    id: record.id,
    name: record.name,
    amount: amountNum,
    frequency: frequency,
    nextDueDate: record.nextDueDate,
    fundedAmount: fundedAmount,
    categoryType: record.categoryType as CategoryType | null,
    isActive: record.isActive,
    createdAt: record.createdAt || undefined,
    updatedAt: record.updatedAt || undefined,
    monthlyContribution,
    displayTarget,
    percentFunded: Math.min(percentFunded, 100),
    isFullyFunded: isPaid,
    daysUntilDue: getDaysUntilDue(record.nextDueDate),
    isPaid,
  };
}

export async function GET(request: NextRequest) {
  const authResult = await requireAuth();
  if (isAuthError(authResult)) return authResult.error;
  const { userId } = authResult;

  const db = await getDb();
  const payments = await db.query.recurringPayments.findMany({
    where: and(eq(recurringPayments.userId, userId), eq(recurringPayments.isActive, true)),
    orderBy: [desc(recurringPayments.nextDueDate)],
  });

  // Get current month/year for filtering transactions
  const now = new Date();
  const currentMonth = now.getMonth();
  const currentYear = now.getFullYear();

  // Calculate funded amount from actual transactions on linked budget items
  const transformed = await Promise.all(payments.map(async (p) => {
    const isMonthly = p.frequency === 'monthly';
    const isIncome = p.categoryType === 'income';

    // Find budget items linked to this recurring payment
    const linkedItems = await db.query.budgetItems.findMany({
      where: eq(budgetItems.recurringPaymentId, p.id),
      with: {
        category: {
          with: {
            budget: true,
          },
        },
        transactions: {
          where: isNull(transactions.deletedAt),
        },
        splitTransactions: true,
      },
    });

    let fundedAmount = 0;

    if (isMonthly || isIncome) {
      // For monthly payments OR income: only count current month's transactions
      // Income is received each month independently — no accumulation across months
      for (const item of linkedItems) {
        if (item.category?.budget?.month === currentMonth &&
            item.category?.budget?.year === currentYear) {
          const txnTotal = item.transactions.reduce((sum, t) => sum + Math.abs(parseFloat(String(t.amount))), 0);
          const splitTotal = item.splitTransactions.reduce((sum, s) => sum + Math.abs(parseFloat(String(s.amount))), 0);
          fundedAmount = txnTotal + splitTotal;
          break;
        }
      }
    } else {
      // For non-monthly expenses: sum transactions across ALL budget items (all months)
      // This accumulates contributions toward the total payment amount
      for (const item of linkedItems) {
        const txnTotal = item.transactions.reduce((sum, t) => sum + Math.abs(parseFloat(String(t.amount))), 0);
        const splitTotal = item.splitTransactions.reduce((sum, s) => sum + Math.abs(parseFloat(String(s.amount))), 0);
        fundedAmount += txnTotal + splitTotal;
      }
    }

    return transformToRecurringPayment(p, fundedAmount, isMonthly, isIncome);
  }));

  // Sort by days until due (ascending - soonest first)
  transformed.sort((a, b) => a.daysUntilDue - b.daysUntilDue);

  return NextResponse.json(transformed);
}

export async function POST(request: NextRequest) {
  const authResult = await requireAuth();
  if (isAuthError(authResult)) return authResult.error;
  const { userId } = authResult;

  const db = await getDb();
  const body = await request.json();
  const { name, amount, frequency, nextDueDate, categoryType, budgetItemId } = body;

  if (!name || !amount || !frequency || !nextDueDate) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }

  const [payment] = await db
    .insert(recurringPayments)
    .values({
      userId,
      name,
      amount: String(parseFloat(amount)),
      frequency,
      nextDueDate,
      categoryType: categoryType || null,
      fundedAmount: '0',
      isActive: true,
    })
    .returning();

  // If a budget item ID was provided, link it to this recurring payment
  if (budgetItemId) {
    await db
      .update(budgetItems)
      .set({ recurringPaymentId: payment.id })
      .where(eq(budgetItems.id, budgetItemId));
  }

  return NextResponse.json(transformToRecurringPayment(payment));
}

export async function PUT(request: NextRequest) {
  const authResult = await requireAuth();
  if (isAuthError(authResult)) return authResult.error;
  const { userId } = authResult;

  const db = await getDb();
  const body = await request.json();
  const { id, name, amount, frequency, nextDueDate, fundedAmount, categoryType, isActive } = body;

  if (!id) {
    return NextResponse.json({ error: 'Missing payment id' }, { status: 400 });
  }

  // Verify ownership
  const existing = await db.query.recurringPayments.findFirst({
    where: and(eq(recurringPayments.id, id), eq(recurringPayments.userId, userId)),
  });

  if (!existing) {
    return NextResponse.json({ error: 'Recurring payment not found' }, { status: 404 });
  }

  const updates: Partial<typeof recurringPayments.$inferInsert> = {
    updatedAt: new Date(),
  };

  if (name !== undefined) updates.name = name;
  if (amount !== undefined) updates.amount = String(parseFloat(amount));
  if (frequency !== undefined) updates.frequency = frequency;
  if (nextDueDate !== undefined) updates.nextDueDate = nextDueDate;
  if (fundedAmount !== undefined) updates.fundedAmount = String(parseFloat(fundedAmount));
  if (categoryType !== undefined) updates.categoryType = categoryType || null;
  if (isActive !== undefined) updates.isActive = isActive;

  const [payment] = await db
    .update(recurringPayments)
    .set(updates)
    .where(eq(recurringPayments.id, id))
    .returning();

  return NextResponse.json(transformToRecurringPayment(payment));
}

export async function DELETE(request: NextRequest) {
  const authResult = await requireAuth();
  if (isAuthError(authResult)) return authResult.error;
  const { userId } = authResult;

  const db = await getDb();
  const searchParams = request.nextUrl.searchParams;
  const id = searchParams.get('id');

  if (!id) {
    return NextResponse.json({ error: 'Missing payment id' }, { status: 400 });
  }

  const paymentId = id;

  // Verify ownership
  const existing = await db.query.recurringPayments.findFirst({
    where: and(eq(recurringPayments.id, paymentId), eq(recurringPayments.userId, userId)),
  });

  if (!existing) {
    return NextResponse.json({ error: 'Recurring payment not found' }, { status: 404 });
  }

  // First, unlink any budget items that reference this recurring payment
  await db
    .update(budgetItems)
    .set({ recurringPaymentId: null })
    .where(eq(budgetItems.recurringPaymentId, paymentId));

  // Then delete the recurring payment
  await db.delete(recurringPayments).where(eq(recurringPayments.id, paymentId));

  return NextResponse.json({ success: true });
}
