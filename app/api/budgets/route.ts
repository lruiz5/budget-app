import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/db';
import { budgets, budgetCategories, budgetItems, recurringPayments } from '@/db/schema';

import { eq, and, asc } from 'drizzle-orm';
import { requireAuth, isAuthError } from '@/lib/auth';

// Helper to calculate monthly contribution based on frequency
function getMonthlyContribution(amount: string | number, frequency: string): string {
  const amt = typeof amount === 'string' ? parseFloat(amount) : amount;
  switch (frequency) {
    case 'weekly': return String(amt * 4);        // 4 payments per month
    case 'bi-weekly': return String(amt * 2);     // 2 payments per month
    case 'monthly': return String(amt);
    case 'quarterly': return String(amt / 3);
    case 'semi-annually': return String(amt / 6);
    case 'annually': return String(amt / 12);
    default: return String(amt);
  }
}

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

  const db = await getDb();
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

  // Ensure all default categories exist for this budget
  if (budget) {
    const existingTypes = budget.categories.map(c => c.categoryType);
    const missingCategories = CATEGORY_TYPES.filter(cat => !existingTypes.includes(cat.type));

    if (missingCategories.length > 0) {
      for (const cat of missingCategories) {
        await db.insert(budgetCategories).values({
          budgetId: budget.id,
          categoryType: cat.type,
          name: cat.name,
        });
      }

      // Re-fetch budget with new categories
      budget = await db.query.budgets.findFirst({
        where: eq(budgets.id, budget.id),
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
  }

  // Sync recurring payments to budget items
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

        // Weekly and bi-weekly use days, others use months
        const daysToAdd =
          recurring.frequency === 'weekly' ? 7 :
          recurring.frequency === 'bi-weekly' ? 14 : 0;
        const monthsToAdd =
          recurring.frequency === 'monthly' ? 1 :
          recurring.frequency === 'quarterly' ? 3 :
          recurring.frequency === 'semi-annually' ? 6 :
          recurring.frequency === 'annually' ? 12 : 0;

        while (next < today) {
          if (daysToAdd > 0) {
            next.setDate(next.getDate() + daysToAdd);
          } else {
            next.setMonth(next.getMonth() + monthsToAdd);
          }
        }

        await db.update(recurringPayments)
          .set({ nextDueDate: next.toISOString().split('T')[0], fundedAmount: '0' })
          .where(eq(recurringPayments.id, recurring.id));

        recurring.nextDueDate = next.toISOString().split('T')[0];
        recurring.fundedAmount = '0';
      }
    }

    let itemsCreated = false;

    for (const recurring of activeRecurring) {
      if (!recurring.categoryType) continue;

      // Find the matching category in this budget
      const category = budget.categories.find(c => c.categoryType === recurring.categoryType);
      if (!category) continue;

      // Calculate the expected monthly contribution
      const monthlyContribution = getMonthlyContribution(recurring.amount, recurring.frequency);

      // Check if a budget item for this recurring payment already exists
      const existingItem = category.items.find(item => item.recurringPaymentId === recurring.id);

      if (existingItem) {
        // Update existing item if planned amount doesn't match (handles bi-weekly, etc.)
        const existingPlanned = parseFloat(String(existingItem.planned));
        const expectedPlanned = parseFloat(monthlyContribution);

        // Update if difference is more than 1 cent (avoid floating point issues)
        if (Math.abs(existingPlanned - expectedPlanned) > 0.01) {
          await db.update(budgetItems)
            .set({ planned: monthlyContribution })
            .where(eq(budgetItems.id, existingItem.id));
          itemsCreated = true; // Flag to re-fetch
        }
        continue;
      }

      // Create the budget item
      const maxOrder = category.items.length > 0
        ? Math.max(...category.items.map(item => item.order || 0))
        : -1;

      await db.insert(budgetItems).values({
        categoryId: category.id,
        name: recurring.name,
        planned: monthlyContribution,
        order: maxOrder + 1,
        recurringPaymentId: recurring.id,
      });

      itemsCreated = true;
    }

    // Re-fetch budget if items were created
    if (itemsCreated) {
      budget = await db.query.budgets.findFirst({
        where: eq(budgets.id, budget.id),
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
  }

  return NextResponse.json(budget);
}

export async function PUT(request: NextRequest) {
  const authResult = await requireAuth();
  if (isAuthError(authResult)) return authResult.error;
  const { userId } = authResult;

  const db = await getDb();
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