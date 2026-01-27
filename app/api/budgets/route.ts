import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { budgets, budgetCategories, budgetItems, recurringPayments } from '@/db/schema';
import { eq, and, asc } from 'drizzle-orm';

// Helper to calculate monthly contribution based on frequency
function getMonthlyContribution(amount: number, frequency: string): number {
  switch (frequency) {
    case 'monthly': return amount;
    case 'quarterly': return amount / 3;
    case 'semi-annually': return amount / 6;
    case 'annually': return amount / 12;
    default: return amount;
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
  const searchParams = request.nextUrl.searchParams;
  const month = parseInt(searchParams.get('month') || '');
  const year = parseInt(searchParams.get('year') || '');

  if (isNaN(month) || isNaN(year)) {
    return NextResponse.json({ error: 'Invalid month or year' }, { status: 400 });
  }

  let budget = await db.query.budgets.findFirst({
    where: and(eq(budgets.month, month), eq(budgets.year, year)),
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
    const [newBudget] = await db.insert(budgets).values({ month, year }).returning();

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

  // Sync recurring payments to budget items
  if (budget) {
    const activeRecurring = await db.query.recurringPayments.findMany({
      where: eq(recurringPayments.isActive, true),
    });

    let itemsCreated = false;

    for (const recurring of activeRecurring) {
      if (!recurring.categoryType) continue;

      // Find the matching category in this budget
      const category = budget.categories.find(c => c.categoryType === recurring.categoryType);
      if (!category) continue;

      // Check if a budget item for this recurring payment already exists
      const existingItem = category.items.find(item => item.recurringPaymentId === recurring.id);
      if (existingItem) continue;

      // Create the budget item
      const monthlyContribution = getMonthlyContribution(recurring.amount, recurring.frequency);
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
  const body = await request.json();
  const { id, buffer } = body;

  if (!id || buffer === undefined) {
    return NextResponse.json({ error: 'Missing id or buffer' }, { status: 400 });
  }

  await db.update(budgets).set({ buffer }).where(eq(budgets.id, id));

  return NextResponse.json({ success: true });
}