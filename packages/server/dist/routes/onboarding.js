import { Hono } from 'hono';
import { getDb } from '@budget-app/shared/db';
import { userOnboarding } from '@budget-app/shared/schema';
import { eq } from 'drizzle-orm';
import { getUserId } from '../middleware/auth';
const route = new Hono();
// GET - Check onboarding status
route.get('/', async (c) => {
    const userId = getUserId(c);
    const db = await getDb();
    const record = await db.query.userOnboarding?.findFirst({
        where: eq(userOnboarding.userId, userId),
    });
    if (!record) {
        return c.json({ completed: false, currentStep: 1 });
    }
    return c.json({
        completed: !!record.completedAt || !!record.skippedAt,
        currentStep: record.currentStep,
        completedAt: record.completedAt,
        skippedAt: record.skippedAt,
    });
});
// POST - Initialize onboarding record
route.post('/', async (c) => {
    const userId = getUserId(c);
    const db = await getDb();
    const existing = await db.select().from(userOnboarding).where(eq(userOnboarding.userId, userId));
    if (existing.length > 0) {
        return c.json(existing[0]);
    }
    const [record] = await db.insert(userOnboarding).values({ userId }).returning();
    return c.json(record);
});
// PUT - Update current step
route.put('/', async (c) => {
    const userId = getUserId(c);
    const db = await getDb();
    const { step } = await c.req.json();
    const existing = await db.select().from(userOnboarding).where(eq(userOnboarding.userId, userId));
    if (existing.length === 0) {
        const [record] = await db.insert(userOnboarding).values({ userId, currentStep: step }).returning();
        return c.json(record);
    }
    await db.update(userOnboarding)
        .set({ currentStep: step, updatedAt: new Date() })
        .where(eq(userOnboarding.userId, userId));
    return c.json({ success: true });
});
// PATCH - Complete or skip onboarding
route.patch('/', async (c) => {
    const userId = getUserId(c);
    const db = await getDb();
    const { action } = await c.req.json();
    const updates = { updatedAt: new Date() };
    if (action === 'complete') {
        updates.completedAt = new Date();
        updates.currentStep = 7;
    }
    else if (action === 'skip') {
        updates.skippedAt = new Date();
    }
    const existing = await db.select().from(userOnboarding).where(eq(userOnboarding.userId, userId));
    if (existing.length === 0) {
        await db.insert(userOnboarding).values({ userId, ...updates });
    }
    else {
        await db.update(userOnboarding).set(updates).where(eq(userOnboarding.userId, userId));
    }
    return c.json({ success: true });
});
export default route;
