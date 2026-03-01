import { Hono } from 'hono';
import { getDb } from '@budget-app/shared/db';
import { budgetItems, budgetCategories, budgets } from '@budget-app/shared/schema';
import { eq, and, isNull } from 'drizzle-orm';
import { getUserId } from '../middleware/auth';
import type { AppEnv } from '../types';

const route = new Hono<AppEnv>();

// POST / - Create a new budget item
route.post('/', async (c) => {
  const userId = getUserId(c);
  const db = await getDb();
  const body = await c.req.json();
  const { categoryId, name, planned } = body;

  if (!categoryId || !name) {
    return c.json({ error: 'Missing required fields' }, 400);
  }

  // Verify category ownership through budget
  const category = await db.query.budgetCategories.findFirst({
    where: eq(budgetCategories.id, categoryId),
    with: { budget: true },
  });

  if (!category || category.budget.userId !== userId) {
    return c.json({ error: 'Category not found' }, 404);
  }

  // Get the max order for this category
  const existingItems = await db.query.budgetItems.findMany({
    where: and(eq(budgetItems.categoryId, categoryId), isNull(budgetItems.deletedAt)),
  });
  const maxOrder = existingItems.length > 0
    ? Math.max(...existingItems.map(item => item.order || 0))
    : -1;

  const [item] = await db
    .insert(budgetItems)
    .values({
      categoryId,
      name,
      planned: planned || '0',
      order: maxOrder + 1,
    })
    .returning();

  return c.json(item);
});

// PUT / - Update a budget item
route.put('/', async (c) => {
  const userId = getUserId(c);
  const db = await getDb();
  const body = await c.req.json();
  const { id, name, planned } = body;

  if (!id) {
    return c.json({ error: 'Missing item id' }, 400);
  }

  // Verify item ownership through category -> budget
  const item = await db.query.budgetItems.findFirst({
    where: eq(budgetItems.id, id),
    with: {
      category: {
        with: { budget: true },
      },
    },
  });

  if (!item || item.category.budget.userId !== userId) {
    return c.json({ error: 'Item not found' }, 404);
  }

  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (name !== undefined) updates.name = name;
  if (planned !== undefined) updates.planned = planned;

  const [updatedItem] = await db
    .update(budgetItems)
    .set(updates)
    .where(eq(budgetItems.id, id))
    .returning();

  return c.json(updatedItem);
});

// DELETE / - Delete a budget item
route.delete('/', async (c) => {
  const userId = getUserId(c);
  const db = await getDb();
  const id = c.req.query('id');

  if (!id) {
    return c.json({ error: 'Missing item id' }, 400);
  }

  // Verify item ownership through category -> budget
  const item = await db.query.budgetItems.findFirst({
    where: eq(budgetItems.id, id),
    with: {
      category: {
        with: { budget: true },
      },
    },
  });

  if (!item || item.category.budget.userId !== userId) {
    return c.json({ error: 'Item not found' }, 404);
  }

  await db.update(budgetItems)
    .set({ deletedAt: new Date(), updatedAt: new Date() })
    .where(eq(budgetItems.id, id));

  return c.json({ success: true });
});

// PUT /reorder - Reorder items within a category
route.put('/reorder', async (c) => {
  const userId = getUserId(c);
  const db = await getDb();
  const body = await c.req.json();
  const { items } = body;

  if (!items || !Array.isArray(items)) {
    return c.json({ error: 'Invalid request' }, 400);
  }

  // Verify ownership for all items before updating
  for (const item of items) {
    const existingItem = await db.query.budgetItems.findFirst({
      where: eq(budgetItems.id, item.id),
      with: {
        category: {
          with: { budget: true },
        },
      },
    });

    if (!existingItem || existingItem.category.budget.userId !== userId) {
      return c.json({ error: 'Item not found' }, 404);
    }
  }

  // Update each item's order
  for (const item of items) {
    await db
      .update(budgetItems)
      .set({ order: item.order, updatedAt: new Date() })
      .where(eq(budgetItems.id, item.id));
  }

  return c.json({ success: true });
});

export default route;
