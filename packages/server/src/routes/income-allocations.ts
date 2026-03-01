import { Hono } from 'hono';
import { getDb } from '@budget-app/shared/db';
import { incomeAllocations } from '@budget-app/shared/schema';
import { eq, and } from 'drizzle-orm';
import { getUserId } from '../middleware/auth';
import type { AppEnv } from '../types';

const route = new Hono<AppEnv>();

// GET / - List all income allocations for the user
route.get('/', async (c) => {
  const userId = getUserId(c);
  const db = await getDb();

  const allocations = await db.query.incomeAllocations.findMany({
    where: eq(incomeAllocations.userId, userId),
  });

  return c.json(allocations);
});

// POST / - Create or update an income allocation
route.post('/', async (c) => {
  const userId = getUserId(c);
  const db = await getDb();
  const { incomeItemName, targetCategoryType } = await c.req.json();

  if (!incomeItemName || !targetCategoryType) {
    return c.json({ error: 'incomeItemName and targetCategoryType are required' }, 400);
  }

  // Check if allocation already exists for this income item name
  const existing = await db.query.incomeAllocations.findFirst({
    where: and(
      eq(incomeAllocations.userId, userId),
      eq(incomeAllocations.incomeItemName, incomeItemName),
    ),
  });

  if (existing) {
    // Update the target category
    const [updated] = await db
      .update(incomeAllocations)
      .set({ targetCategoryType, updatedAt: new Date() })
      .where(eq(incomeAllocations.id, existing.id))
      .returning();
    return c.json(updated);
  }

  // Create new allocation
  const [created] = await db
    .insert(incomeAllocations)
    .values({
      userId,
      incomeItemName,
      targetCategoryType,
    })
    .returning();

  return c.json(created, 201);
});

// DELETE /:id - Remove an income allocation
route.delete('/:id', async (c) => {
  const userId = getUserId(c);
  const db = await getDb();
  const id = c.req.param('id');

  // Verify ownership
  const allocation = await db.query.incomeAllocations.findFirst({
    where: and(
      eq(incomeAllocations.id, id),
      eq(incomeAllocations.userId, userId),
    ),
  });

  if (!allocation) {
    return c.json({ error: 'Allocation not found' }, 404);
  }

  await db.delete(incomeAllocations).where(eq(incomeAllocations.id, id));

  return c.json({ success: true });
});

export default route;
