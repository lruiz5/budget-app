import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { budgets, budgetCategories, budgetItems, recurringPayments } from '@/db/schema';
import { eq, and, asc } from 'drizzle-orm';

// Helper to calculate monthly contribution based on frequency
function getMonthlyContribution(amount: string | number, frequency: string): string {
  const amt = typeof amount === 'string' ? parseFloat(amount) : amount;
  switch (frequency) {
    case 'monthly': return String(amt);
    case 'quarterly': return String(amt / 3);
    case 'semi-annually': return String(amt / 6);
    case 'annually': return String(amt / 12);
    default: return String(amt);
  }
}
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

export async function POST(request: NextRequest) {
  const authResult = await requireAuth();
  if (isAuthError(authResult)) return authResult.error;
  const { userId } = authResult;

  const body = await request.json();
  const { sourceMonth, sourceYear, targetMonth, targetYear } = body;

  if (
    sourceMonth === undefined ||
    sourceYear === undefined ||
    targetMonth === undefined ||
    targetYear === undefined
  ) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }

  // Fetch source budget with all items
  const sourceBudget = await db.query.budgets.findFirst({
    where: and(eq(budgets.userId, userId), eq(budgets.month, sourceMonth), eq(budgets.year, sourceYear)),
    with: {
      categories: {
        with: {
          items: {
            orderBy: [asc(budgetItems.order)],
          },
        },
      },
    },
  });

  // Get or create target budget
  let targetBudget = await db.query.budgets.findFirst({
    where: and(eq(budgets.userId, userId), eq(budgets.month, targetMonth), eq(budgets.year, targetYear)),
    with: {
      categories: true,
    },
  });

  if (!targetBudget) {
    const [newBudget] = await db.insert(budgets).values({
      userId,
      month: targetMonth,
      year: targetYear,
      buffer: sourceBudget?.buffer || '0',
    }).returning();

    for (const cat of CATEGORY_TYPES) {
      await db.insert(budgetCategories).values({
        budgetId: newBudget.id,
        categoryType: cat.type,
        name: cat.name,
      });
    }

    targetBudget = await db.query.budgets.findFirst({
      where: eq(budgets.id, newBudget.id),
      with: {
        categories: true,
      },
    });
  }

  if (!targetBudget) {
    return NextResponse.json({ error: 'Failed to create target budget' }, { status: 500 });
  }

  // If no source budget exists, just return success (empty budget was created)
  if (!sourceBudget) {
    return NextResponse.json({ success: true, message: 'No source budget to copy from' });
  }

  // Copy items from source to target
  for (const sourceCategory of sourceBudget.categories) {
    let targetCategory = targetBudget.categories.find(
      (c) => c.categoryType === sourceCategory.categoryType
    );

    // Create custom category in target if it doesn't exist
    if (!targetCategory) {
      const [newCat] = await db.insert(budgetCategories).values({
        budgetId: targetBudget.id,
        categoryType: sourceCategory.categoryType,
        name: sourceCategory.name,
        emoji: sourceCategory.emoji,
        categoryOrder: sourceCategory.categoryOrder ?? 0,
      }).returning();
      targetCategory = newCat;
    }

    if (targetCategory && sourceCategory.items.length > 0) {
      for (const item of sourceCategory.items) {
        // Skip items linked to recurring payments - the recurring sync below will handle those
        if (item.recurringPaymentId) continue;

        await db.insert(budgetItems).values({
          categoryId: targetCategory.id,
          name: item.name,
          planned: item.planned,
          order: item.order,
        });
      }
    }
  }

  // Sync recurring payments: create budget items for active recurring payments
  const activeRecurring = await db.query.recurringPayments.findMany({
    where: and(eq(recurringPayments.userId, userId), eq(recurringPayments.isActive, true)),
  });

  // Re-fetch target categories with items to check what already exists
  const updatedTarget = await db.query.budgets.findFirst({
    where: eq(budgets.id, targetBudget.id),
    with: {
      categories: {
        with: {
          items: true,
        },
      },
    },
  });

  if (updatedTarget) {
    for (const recurring of activeRecurring) {
      if (!recurring.categoryType) continue;

      const category = updatedTarget.categories.find(c => c.categoryType === recurring.categoryType);
      if (!category) continue;

      const existingItem = category.items.find(item => item.recurringPaymentId === recurring.id);
      if (existingItem) continue;

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
    }
  }

  return NextResponse.json({ success: true });
}
