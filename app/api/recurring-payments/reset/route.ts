import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { recurringPayments } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { RecurringFrequency } from '@/types/budget';

// Helper to calculate next due date based on frequency
function getNextDueDate(currentDueDate: string, frequency: RecurringFrequency): string {
  const date = new Date(currentDueDate);

  switch (frequency) {
    case 'monthly':
      date.setMonth(date.getMonth() + 1);
      break;
    case 'quarterly':
      date.setMonth(date.getMonth() + 3);
      break;
    case 'semi-annually':
      date.setMonth(date.getMonth() + 6);
      break;
    case 'annually':
      date.setFullYear(date.getFullYear() + 1);
      break;
  }

  return date.toISOString().split('T')[0];
}

// POST /api/recurring-payments/reset
// Marks a payment as paid and resets for the next cycle
export async function POST(request: NextRequest) {
  const body = await request.json();
  const { id } = body;

  if (!id) {
    return NextResponse.json({ error: 'Missing payment id' }, { status: 400 });
  }

  // Get current payment
  const payment = await db.query.recurringPayments.findFirst({
    where: eq(recurringPayments.id, parseInt(id)),
  });

  if (!payment) {
    return NextResponse.json({ error: 'Payment not found' }, { status: 404 });
  }

  // Calculate next due date and reset funded amount
  const nextDueDate = getNextDueDate(payment.nextDueDate, payment.frequency as RecurringFrequency);

  const [updated] = await db
    .update(recurringPayments)
    .set({
      nextDueDate,
      fundedAmount: 0,
      updatedAt: new Date(),
    })
    .where(eq(recurringPayments.id, parseInt(id)))
    .returning();

  return NextResponse.json({
    success: true,
    payment: updated,
  });
}
