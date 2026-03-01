import { Hono } from 'hono';
import { getDb } from '@budget-app/shared/db';
import { budgetCategories, budgetItems, transactions, splitTransactions, budgets } from '@budget-app/shared/schema';
import { eq, inArray } from 'drizzle-orm';
import { getUserId } from '../middleware/auth';
function slugify(name) {
    return name
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');
}
const route = new Hono();
// POST / - Create a new custom category
route.post('/', async (c) => {
    const userId = getUserId(c);
    const db = await getDb();
    const body = await c.req.json();
    const { budgetId, name, emoji } = body;
    if (!budgetId || !name?.trim() || !emoji) {
        return c.json({ error: 'Missing required fields' }, 400);
    }
    // Verify budget ownership
    const budget = await db.query.budgets.findFirst({
        where: eq(budgets.id, budgetId),
        with: { categories: true },
    });
    if (!budget || budget.userId !== userId) {
        return c.json({ error: 'Budget not found' }, 404);
    }
    const categoryType = slugify(name);
    // Check for duplicate categoryType in this budget
    const existing = budget.categories.find(cat => cat.categoryType === categoryType);
    if (existing) {
        return c.json({ error: 'A category with this name already exists' }, 409);
    }
    // Determine order (after all existing categories)
    const maxOrder = budget.categories.length > 0
        ? Math.max(...budget.categories.map(cat => cat.categoryOrder ?? 0))
        : -1;
    const [newCategory] = await db.insert(budgetCategories).values({
        budgetId,
        categoryType,
        name: name.trim(),
        emoji,
        categoryOrder: maxOrder + 1,
    }).returning();
    return c.json(newCategory);
});
// DELETE / - Delete a custom category (cascade delete items/transactions)
route.delete('/', async (c) => {
    const userId = getUserId(c);
    const db = await getDb();
    const id = c.req.query('id');
    if (!id) {
        return c.json({ error: 'Invalid category id' }, 400);
    }
    // Verify ownership through budget
    const category = await db.query.budgetCategories.findFirst({
        where: eq(budgetCategories.id, id),
        with: {
            budget: true,
            items: true,
        },
    });
    if (!category || category.budget.userId !== userId) {
        return c.json({ error: 'Category not found' }, 404);
    }
    // Don't allow deleting default categories
    const defaultTypes = ['income', 'giving', 'household', 'transportation', 'food', 'personal', 'insurance', 'saving'];
    if (defaultTypes.includes(category.categoryType)) {
        return c.json({ error: 'Cannot delete default categories' }, 400);
    }
    // Soft-delete cascade: mark items, splits, and category as deleted
    const now = new Date();
    if (category.items.length > 0) {
        const itemIds = category.items.map(i => i.id);
        // Soft delete split transactions referencing these items
        await db.update(splitTransactions)
            .set({ deletedAt: now, updatedAt: now })
            .where(inArray(splitTransactions.budgetItemId, itemIds));
        // Unlink transactions from these items
        await db.update(transactions)
            .set({ budgetItemId: null, updatedAt: now })
            .where(inArray(transactions.budgetItemId, itemIds));
        // Soft delete budget items
        await db.update(budgetItems)
            .set({ deletedAt: now, updatedAt: now })
            .where(inArray(budgetItems.id, itemIds));
    }
    // Soft delete the category
    await db.update(budgetCategories)
        .set({ deletedAt: now, updatedAt: now })
        .where(eq(budgetCategories.id, id));
    return c.json({ success: true });
});
export default route;
