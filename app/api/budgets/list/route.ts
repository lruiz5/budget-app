import { NextResponse } from 'next/server';
import { db } from '@/db';
import { budgets, budgetCategories, budgetItems } from '@/db/schema';
import { eq, asc } from 'drizzle-orm';
import { requireAuth, isAuthError } from '@/lib/auth';

// Read-only: returns all existing budgets for a user (no auto-create).
// Used by Insights to load historical data without creating empty shells.
export async function GET() {
  const authResult = await requireAuth();
  if (isAuthError(authResult)) return authResult.error;
  const { userId } = authResult;

  const userBudgets = await db.query.budgets.findMany({
    where: eq(budgets.userId, userId),
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

  return NextResponse.json(userBudgets);
}
