import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { recurringPayments, budgetItems, transactions, splitTransactions } from '@/db/schema';
import { eq, desc, and, isNull } from 'drizzle-orm';
import { RecurringPayment, RecurringFrequency, CategoryType } from '@/types/budget';

// Helper to calculate months in a frequency cycle
function getMonthsInCycle(frequency: RecurringFrequency): number {
  switch (frequency) {
    case 'monthly': return 1;
    case 'quarterly': return 3;
    case 'semi-annually': return 6;
    case 'annually': return 12;
    default: return 1;
  }
}

// Helper to calculate days until due
function getDaysUntilDue(nextDueDate: string): number {
  const due = new Date(nextDueDate);
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
  isMonthly?: boolean
): RecurringPayment {
  const monthsInCycle = getMonthsInCycle(record.frequency as RecurringFrequency);
  const monthlyContribution = record.amount / monthsInCycle;

  // Use calculated funded amount from transactions if provided, otherwise use DB value
  const fundedAmount = calculatedFundedAmount !== undefined ? calculatedFundedAmount : record.fundedAmount;

  // For monthly: progress is against the monthly amount (same as total)
  // For non-monthly: progress is against the TOTAL amount (cumulative across months)
  const targetAmount = isMonthly ? monthlyContribution : record.amount;
  const percentFunded = targetAmount > 0 ? (fundedAmount / targetAmount) * 100 : 0;

  // isPaid: for monthly, funded >= amount; for non-monthly, cumulative funded >= total amount
  const isPaid = fundedAmount >= targetAmount;

  return {
    id: record.id,
    name: record.name,
    amount: record.amount,
    frequency: record.frequency as RecurringFrequency,
    nextDueDate: record.nextDueDate,
    fundedAmount: fundedAmount,
    categoryType: record.categoryType as CategoryType | null,
    isActive: record.isActive,
    createdAt: record.createdAt || undefined,
    updatedAt: record.updatedAt || undefined,
    monthlyContribution,
    percentFunded: Math.min(percentFunded, 100),
    isFullyFunded: isPaid,
    daysUntilDue: getDaysUntilDue(record.nextDueDate),
    isPaid,
  };
}

export async function GET() {
  const payments = await db.query.recurringPayments.findMany({
    where: eq(recurringPayments.isActive, true),
    orderBy: [desc(recurringPayments.nextDueDate)],
  });

  // Get current month/year for filtering transactions
  const now = new Date();
  const currentMonth = now.getMonth();
  const currentYear = now.getFullYear();

  // Calculate funded amount from actual transactions on linked budget items
  const transformed = await Promise.all(payments.map(async (p) => {
    const isMonthly = p.frequency === 'monthly';

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

    if (isMonthly) {
      // For monthly: only count current month's transactions
      for (const item of linkedItems) {
        if (item.category?.budget?.month === currentMonth &&
            item.category?.budget?.year === currentYear) {
          const txnTotal = item.transactions.reduce((sum, t) => sum + Math.abs(t.amount), 0);
          const splitTotal = item.splitTransactions.reduce((sum, s) => sum + Math.abs(s.amount), 0);
          fundedAmount = txnTotal + splitTotal;
          break;
        }
      }
    } else {
      // For non-monthly: sum transactions across ALL budget items (all months)
      // This accumulates contributions toward the total payment amount
      for (const item of linkedItems) {
        const txnTotal = item.transactions.reduce((sum, t) => sum + Math.abs(t.amount), 0);
        const splitTotal = item.splitTransactions.reduce((sum, s) => sum + Math.abs(s.amount), 0);
        fundedAmount += txnTotal + splitTotal;
      }
    }

    return transformToRecurringPayment(p, fundedAmount, isMonthly);
  }));

  // Sort by days until due (ascending - soonest first)
  transformed.sort((a, b) => a.daysUntilDue - b.daysUntilDue);

  return NextResponse.json(transformed);
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { name, amount, frequency, nextDueDate, categoryType, budgetItemId } = body;

  if (!name || !amount || !frequency || !nextDueDate) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }

  const [payment] = await db
    .insert(recurringPayments)
    .values({
      name,
      amount: parseFloat(amount),
      frequency,
      nextDueDate,
      categoryType: categoryType || null,
      fundedAmount: 0,
      isActive: true,
    })
    .returning();

  // If a budget item ID was provided, link it to this recurring payment
  if (budgetItemId) {
    await db
      .update(budgetItems)
      .set({ recurringPaymentId: payment.id })
      .where(eq(budgetItems.id, parseInt(budgetItemId)));
  }

  return NextResponse.json(transformToRecurringPayment(payment));
}

export async function PUT(request: NextRequest) {
  const body = await request.json();
  const { id, name, amount, frequency, nextDueDate, fundedAmount, categoryType, isActive } = body;

  if (!id) {
    return NextResponse.json({ error: 'Missing payment id' }, { status: 400 });
  }

  const updates: Partial<typeof recurringPayments.$inferInsert> = {
    updatedAt: new Date(),
  };

  if (name !== undefined) updates.name = name;
  if (amount !== undefined) updates.amount = parseFloat(amount);
  if (frequency !== undefined) updates.frequency = frequency;
  if (nextDueDate !== undefined) updates.nextDueDate = nextDueDate;
  if (fundedAmount !== undefined) updates.fundedAmount = parseFloat(fundedAmount);
  if (categoryType !== undefined) updates.categoryType = categoryType || null;
  if (isActive !== undefined) updates.isActive = isActive;

  const [payment] = await db
    .update(recurringPayments)
    .set(updates)
    .where(eq(recurringPayments.id, parseInt(id)))
    .returning();

  return NextResponse.json(transformToRecurringPayment(payment));
}

export async function DELETE(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const id = searchParams.get('id');

  if (!id) {
    return NextResponse.json({ error: 'Missing payment id' }, { status: 400 });
  }

  const paymentId = parseInt(id);

  // First, unlink any budget items that reference this recurring payment
  await db
    .update(budgetItems)
    .set({ recurringPaymentId: null })
    .where(eq(budgetItems.recurringPaymentId, paymentId));

  // Then delete the recurring payment
  await db.delete(recurringPayments).where(eq(recurringPayments.id, paymentId));

  return NextResponse.json({ success: true });
}
