import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { budgetItems, budgetCategories, budgets } from '@/db/schema';
import { eq, and } from 'drizzle-orm';
import { requireAuth, isAuthError } from '@/lib/auth';

export async function POST(request: NextRequest) {
  const authResult = await requireAuth();
  if (isAuthError(authResult)) return authResult.error;
  const { userId } = authResult;

  const body = await request.json();
  const { categoryId, name, planned, expectedDay } = body;

  if (!categoryId || !name) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }

  // Verify category ownership through budget
  const category = await db.query.budgetCategories.findFirst({
    where: eq(budgetCategories.id, parseInt(categoryId)),
    with: { budget: true },
  });

  if (!category || category.budget.userId !== userId) {
    return NextResponse.json({ error: 'Category not found' }, { status: 404 });
  }

  // Get the max order for this category
  const existingItems = await db.query.budgetItems.findMany({
    where: eq(budgetItems.categoryId, parseInt(categoryId)),
  });
  const maxOrder = existingItems.length > 0
    ? Math.max(...existingItems.map(item => item.order || 0))
    : -1;

  const [item] = await db
    .insert(budgetItems)
    .values({
      categoryId: parseInt(categoryId),
      name,
      planned: planned || '0',
      order: maxOrder + 1,
      ...(expectedDay !== undefined && { expectedDay }),
    })
    .returning();

  return NextResponse.json(item);
}

export async function PUT(request: NextRequest) {
  const authResult = await requireAuth();
  if (isAuthError(authResult)) return authResult.error;
  const { userId } = authResult;

  const body = await request.json();
  const { id, name, planned, expectedDay } = body;

  if (!id) {
    return NextResponse.json({ error: 'Missing item id' }, { status: 400 });
  }

  // Verify item ownership through category -> budget
  const item = await db.query.budgetItems.findFirst({
    where: eq(budgetItems.id, parseInt(id)),
    with: {
      category: {
        with: { budget: true },
      },
    },
  });

  if (!item || item.category.budget.userId !== userId) {
    return NextResponse.json({ error: 'Item not found' }, { status: 404 });
  }

  const updates: Record<string, unknown> = {};
  if (name !== undefined) updates.name = name;
  if (planned !== undefined) updates.planned = planned;
  if (expectedDay !== undefined) updates.expectedDay = expectedDay;

  const [updatedItem] = await db
    .update(budgetItems)
    .set(updates)
    .where(eq(budgetItems.id, parseInt(id)))
    .returning();

  return NextResponse.json(updatedItem);
}

export async function DELETE(request: NextRequest) {
  const authResult = await requireAuth();
  if (isAuthError(authResult)) return authResult.error;
  const { userId } = authResult;

  const searchParams = request.nextUrl.searchParams;
  const id = searchParams.get('id');

  if (!id) {
    return NextResponse.json({ error: 'Missing item id' }, { status: 400 });
  }

  // Verify item ownership through category -> budget
  const item = await db.query.budgetItems.findFirst({
    where: eq(budgetItems.id, parseInt(id)),
    with: {
      category: {
        with: { budget: true },
      },
    },
  });

  if (!item || item.category.budget.userId !== userId) {
    return NextResponse.json({ error: 'Item not found' }, { status: 404 });
  }

  await db.delete(budgetItems).where(eq(budgetItems.id, parseInt(id)));

  return NextResponse.json({ success: true });
}