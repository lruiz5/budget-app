import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { budgets, budgetCategories, budgetItems, recurringPayments } from '@/db/schema';

import { eq, and, asc } from 'drizzle-orm';
import { requireAuth, isAuthError } from '@/lib/auth';

const CATEGORY_TYPES = [
  { type: 'income', name: 'Income' },
  { type: 'giving', name: 'Giving' },
  { type: 'household', name: 'Household' },
  { type: 'transportation', name: 'Transportation' },
  { type: 'food', name: 'Food' },
  { type: 'personal', name: 'Personal' },
  { type: 'insurance', name: 'Insurance' },
  { type: 'saving', name: 'Saving' },
];

export async function GET(request: NextRequest) {
  const authResult = await requireAuth();
  if (isAuthError(authResult)) return authResult.error;
  const { userId } = authResult;

  const searchParams = request.nextUrl.searchParams;
  const month = parseInt(searchParams.get('month') || '');
  const year = parseInt(searchParams.get('year') || '');

  if (isNaN(month) || isNaN(year)) {
    return NextResponse.json({ error: 'Invalid month or year' }, { status: 400 });
  }

  let budget = await db.query.budgets.findFirst({
    where: and(eq(budgets.userId, userId), eq(budgets.month, month), eq(budgets.year, year)),
    with: {
      categories: {
        with: {
          items: {
            orderBy: [asc(budgetItems.order)],
            with: {
              transactions: true,
              splitTransactions: {
                with: {
                  parentTransaction: true,
                },
              },
            },
          },
        },
      },
    },
  });

  if (!budget) {
    const [newBudget] = await db.insert(budgets).values({ userId, month, year }).returning();

    for (const cat of CATEGORY_TYPES) {
      await db.insert(budgetCategories).values({
        budgetId: newBudget.id,
        categoryType: cat.type,
        name: cat.name,
      });
    }

    budget = await db.query.budgets.findFirst({
      where: eq(budgets.id, newBudget.id),
      with: {
        categories: {
          with: {
            items: {
              orderBy: [asc(budgetItems.order)],
              with: {
                transactions: true,
                splitTransactions: {
                  with: {
                    parentTransaction: true,
                  },
                },
              },
            },
          },
        },
      },
    });
  }

  // Auto-advance recurring payment due dates (don't create budget items yet - that happens on copy/start)
  if (budget) {
    const activeRecurring = await db.query.recurringPayments.findMany({
      where: and(eq(recurringPayments.userId, userId), eq(recurringPayments.isActive, true)),
    });

    // Auto-advance recurring payments whose due date has passed
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    for (const recurring of activeRecurring) {
      const dueDate = new Date(recurring.nextDueDate);
      dueDate.setHours(0, 0, 0, 0);

      if (dueDate < today) {
        // Advance nextDueDate by one frequency period (keep advancing until it's in the future)
        const next = new Date(dueDate);
        const monthsToAdd =
          recurring.frequency === 'monthly' ? 1 :
          recurring.frequency === 'quarterly' ? 3 :
          recurring.frequency === 'semi-annually' ? 6 : 12;

        while (next < today) {
          next.setMonth(next.getMonth() + monthsToAdd);
        }

        await db.update(recurringPayments)
          .set({ nextDueDate: next.toISOString().split('T')[0], fundedAmount: '0' })
          .where(eq(recurringPayments.id, recurring.id));

        recurring.nextDueDate = next.toISOString().split('T')[0];
        recurring.fundedAmount = '0';
      }
    }

  }

  return NextResponse.json(budget);
}

export async function PUT(request: NextRequest) {
  const authResult = await requireAuth();
  if (isAuthError(authResult)) return authResult.error;
  const { userId } = authResult;

  const body = await request.json();
  const { id, buffer } = body;

  if (!id || buffer === undefined) {
    return NextResponse.json({ error: 'Missing id or buffer' }, { status: 400 });
  }

  // Verify ownership
  const existing = await db.query.budgets.findFirst({
    where: and(eq(budgets.id, id), eq(budgets.userId, userId)),
  });

  if (!existing) {
    return NextResponse.json({ error: 'Budget not found' }, { status: 404 });
  }

  await db.update(budgets).set({ buffer }).where(eq(budgets.id, id));

  return NextResponse.json({ success: true });
}