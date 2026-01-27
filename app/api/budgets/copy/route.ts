import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { budgets, budgetCategories, budgetItems } from '@/db/schema';
import { eq, and, asc } from 'drizzle-orm';

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
    where: and(eq(budgets.month, sourceMonth), eq(budgets.year, sourceYear)),
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
    where: and(eq(budgets.month, targetMonth), eq(budgets.year, targetYear)),
    with: {
      categories: true,
    },
  });

  if (!targetBudget) {
    const [newBudget] = await db.insert(budgets).values({
      month: targetMonth,
      year: targetYear,
      buffer: sourceBudget?.buffer || 0,
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
    const targetCategory = targetBudget.categories.find(
      (c) => c.categoryType === sourceCategory.categoryType
    );

    if (targetCategory && sourceCategory.items.length > 0) {
      for (const item of sourceCategory.items) {
        await db.insert(budgetItems).values({
          categoryId: targetCategory.id,
          name: item.name,
          planned: item.planned,
          order: item.order,
        });
      }
    }
  }

  return NextResponse.json({ success: true });
}
