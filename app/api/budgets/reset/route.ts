import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { budgets, budgetCategories, budgetItems, recurringPayments } from '@/db/schema';
import { eq, and, asc, inArray } from 'drizzle-orm';
import { requireAuth, isAuthError } from '@/lib/auth';

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

export async function POST(request: NextRequest) {
  const authResult = await requireAuth();
  if (isAuthError(authResult)) return authResult.error;
  const { userId } = authResult;

  const body = await request.json();
  const { budgetId, mode } = body;

  if (!budgetId || !mode) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }

  // Verify ownership
  const budget = await db.query.budgets.findFirst({
    where: and(eq(budgets.id, budgetId), eq(budgets.userId, userId)),
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

  if (!budget) {
    return NextResponse.json({ error: 'Budget not found' }, { status: 404 });
  }

  if (mode === 'zero') {
    // Set all planned amounts to 0
    const allItemIds = budget.categories.flatMap(c => c.items.map(i => i.id));
    if (allItemIds.length > 0) {
      await db.update(budgetItems)
        .set({ planned: '0' })
        .where(inArray(budgetItems.id, allItemIds));
    }

    return NextResponse.json({ success: true });
  }

  if (mode === 'replace') {
    // Delete all current budget items
    const categoryIds = budget.categories.map(c => c.id);
    if (categoryIds.length > 0) {
      await db.delete(budgetItems)
        .where(inArray(budgetItems.categoryId, categoryIds));
    }

    // Also delete any custom categories (non-default) so they can be re-created from source
    const defaultTypes = ['income', 'giving', 'household', 'transportation', 'food', 'personal', 'insurance', 'saving'];
    const customCategories = budget.categories.filter(c => !defaultTypes.includes(c.categoryType));
    for (const custom of customCategories) {
      await db.delete(budgetCategories).where(eq(budgetCategories.id, custom.id));
    }

    // Copy from previous month
    const prevMonth = budget.month === 1 ? 12 : budget.month - 1;
    const prevYear = budget.month === 1 ? budget.year - 1 : budget.year;

    const sourceBudget = await db.query.budgets.findFirst({
      where: and(eq(budgets.userId, userId), eq(budgets.month, prevMonth), eq(budgets.year, prevYear)),
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

    // Re-fetch target categories (custom ones were deleted, defaults remain)
    const targetBudget = await db.query.budgets.findFirst({
      where: eq(budgets.id, budgetId),
      with: { categories: true },
    });

    if (!targetBudget) {
      return NextResponse.json({ error: 'Budget not found after cleanup' }, { status: 500 });
    }

    if (sourceBudget) {
      for (const sourceCategory of sourceBudget.categories) {
        let targetCategory = targetBudget.categories.find(
          (c) => c.categoryType === sourceCategory.categoryType
        );

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
    }

    // Sync recurring payments
    const activeRecurring = await db.query.recurringPayments.findMany({
      where: and(eq(recurringPayments.userId, userId), eq(recurringPayments.isActive, true)),
    });

    const updatedTarget = await db.query.budgets.findFirst({
      where: eq(budgets.id, budgetId),
      with: {
        categories: {
          with: { items: true },
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

  return NextResponse.json({ error: 'Invalid mode' }, { status: 400 });
}
