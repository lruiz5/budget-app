import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { budgets, budgetCategories, budgetItems } from '@/db/schema';
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