import { Hono } from 'hono';
import { getDb } from '@budget-app/shared/db';
import { budgets, budgetCategories, budgetItems, transactions, userOnboarding, recurringPayments } from '@budget-app/shared/schema';
import { eq, and, asc, inArray } from 'drizzle-orm';
import { getUserId } from '../middleware/auth';
import { getMonthlyContribution, CATEGORY_TYPES } from '../lib/helpers';
import { DEMO_DATA, DEMO_BUFFER } from '../lib/demoData';
// Helper to fetch a full budget with nested relations
async function fetchBudgetFull(budgetId) {
    const db = await getDb();
    return db.query.budgets.findFirst({
        where: eq(budgets.id, budgetId),
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
// Helper to fetch a budget with categories and items (no transactions)
async function fetchBudgetWithItems(budgetId) {
    const db = await getDb();
    return db.query.budgets.findFirst({
        where: eq(budgets.id, budgetId),
        with: {
            categories: {
                with: {
                    items: true,
                },
            },
        },
    });
}
const route = new Hono();
// GET / - Get or create budget for a month/year, sync recurring payments
route.get('/', async (c) => {
    const userId = getUserId(c);
    const db = await getDb();
    const month = parseInt(c.req.query('month') || '');
    const year = parseInt(c.req.query('year') || '');
    if (isNaN(month) || isNaN(year)) {
        return c.json({ error: 'Invalid month or year' }, 400);
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
        budget = await fetchBudgetFull(newBudget.id);
    }
    // Ensure all default categories exist for this budget
    if (budget) {
        const existingTypes = budget.categories.map(c => c.categoryType);
        const missingCategories = CATEGORY_TYPES.filter(cat => !existingTypes.includes(cat.type));
        if (missingCategories.length > 0) {
            for (const cat of missingCategories) {
                await db.insert(budgetCategories).values({
                    budgetId: budget.id,
                    categoryType: cat.type,
                    name: cat.name,
                });
            }
            budget = await fetchBudgetFull(budget.id);
        }
    }
    // Sync recurring payments to budget items
    if (budget) {
        const activeRecurring = await db.query.recurringPayments.findMany({
            where: and(eq(recurringPayments.userId, userId), eq(recurringPayments.isActive, true)),
        });
        // Auto-advance recurring payments whose due date has passed
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        for (const recurring of activeRecurring) {
            // Parse YYYY-MM-DD as local date to avoid UTC shift
            const [dy, dm, dd] = recurring.nextDueDate.split('-').map(Number);
            const dueDate = new Date(dy, dm - 1, dd);
            if (dueDate < today) {
                const next = new Date(dueDate);
                // Weekly and bi-weekly use days, others use months
                const daysToAdd = recurring.frequency === 'weekly' ? 7 :
                    recurring.frequency === 'bi-weekly' ? 14 : 0;
                const monthsToAdd = recurring.frequency === 'monthly' ? 1 :
                    recurring.frequency === 'quarterly' ? 3 :
                        recurring.frequency === 'semi-annually' ? 6 :
                            recurring.frequency === 'annually' ? 12 : 0;
                while (next < today) {
                    if (daysToAdd > 0) {
                        next.setDate(next.getDate() + daysToAdd);
                    }
                    else {
                        next.setMonth(next.getMonth() + monthsToAdd);
                    }
                }
                // Format as YYYY-MM-DD using local date components
                const nextStr = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}-${String(next.getDate()).padStart(2, '0')}`;
                await db.update(recurringPayments)
                    .set({ nextDueDate: nextStr, fundedAmount: '0' })
                    .where(eq(recurringPayments.id, recurring.id));
                recurring.nextDueDate = nextStr;
                recurring.fundedAmount = '0';
            }
        }
        let itemsCreated = false;
        for (const recurring of activeRecurring) {
            if (!recurring.categoryType)
                continue;
            const category = budget.categories.find(c => c.categoryType === recurring.categoryType);
            if (!category)
                continue;
            const monthlyContribution = getMonthlyContribution(recurring.amount, recurring.frequency);
            const existingItem = category.items.find(item => item.recurringPaymentId === recurring.id);
            if (existingItem) {
                // Item already exists for this recurring payment — don't overwrite
                // the planned amount since the user may have customized it
                continue;
            }
            // Create the budget item
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
            itemsCreated = true;
        }
        if (itemsCreated) {
            budget = await fetchBudgetFull(budget.id);
        }
    }
    return c.json(budget);
});
// PUT / - Update budget buffer
route.put('/', async (c) => {
    const userId = getUserId(c);
    const db = await getDb();
    const body = await c.req.json();
    const { id, buffer } = body;
    if (!id || buffer === undefined) {
        return c.json({ error: 'Missing id or buffer' }, 400);
    }
    const existing = await db.query.budgets.findFirst({
        where: and(eq(budgets.id, id), eq(budgets.userId, userId)),
    });
    if (!existing) {
        return c.json({ error: 'Budget not found' }, 404);
    }
    await db.update(budgets).set({ buffer, updatedAt: new Date() }).where(eq(budgets.id, id));
    return c.json({ success: true });
});
// ============================================================================
// SUB-ROUTES
// ============================================================================
// POST /copy - Copy budget from one month to another
// NOTE: Uses fromMonth/fromYear/toMonth/toYear to match api-client
route.post('/copy', async (c) => {
    const userId = getUserId(c);
    const db = await getDb();
    const body = await c.req.json();
    const { fromMonth, fromYear, toMonth, toYear } = body;
    if (fromMonth === undefined ||
        fromYear === undefined ||
        toMonth === undefined ||
        toYear === undefined) {
        return c.json({ error: 'Missing required fields' }, 400);
    }
    // Fetch source budget with all items
    const sourceBudget = await db.query.budgets.findFirst({
        where: and(eq(budgets.userId, userId), eq(budgets.month, fromMonth), eq(budgets.year, fromYear)),
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
    // Get or create target budget (include items to check for duplicates)
    let targetBudget = await db.query.budgets.findFirst({
        where: and(eq(budgets.userId, userId), eq(budgets.month, toMonth), eq(budgets.year, toYear)),
        with: {
            categories: {
                with: {
                    items: true,
                },
            },
        },
    });
    if (!targetBudget) {
        const [newBudget] = await db.insert(budgets).values({
            userId,
            month: toMonth,
            year: toYear,
            buffer: sourceBudget?.buffer || '0',
        }).returning();
        for (const cat of CATEGORY_TYPES) {
            await db.insert(budgetCategories).values({
                budgetId: newBudget.id,
                categoryType: cat.type,
                name: cat.name,
            });
        }
        targetBudget = await fetchBudgetWithItems(newBudget.id);
    }
    if (!targetBudget) {
        return c.json({ error: 'Failed to create target budget' }, 500);
    }
    // If no source budget exists, just return success (empty budget was created)
    if (!sourceBudget) {
        return c.json({ success: true, message: 'No source budget to copy from' });
    }
    // Copy items from source to target
    for (const sourceCategory of sourceBudget.categories) {
        const existingTargetCategory = targetBudget.categories.find((c) => c.categoryType === sourceCategory.categoryType);
        let targetCategoryId;
        let existingItems = [];
        // Create custom category in target if it doesn't exist
        if (!existingTargetCategory) {
            const [newCat] = await db.insert(budgetCategories).values({
                budgetId: targetBudget.id,
                categoryType: sourceCategory.categoryType,
                name: sourceCategory.name,
                emoji: sourceCategory.emoji,
                categoryOrder: sourceCategory.categoryOrder ?? 0,
            }).returning();
            targetCategoryId = newCat.id;
        }
        else {
            targetCategoryId = existingTargetCategory.id;
            existingItems = existingTargetCategory.items;
        }
        if (sourceCategory.items.length > 0) {
            for (const item of sourceCategory.items) {
                // Check for duplicate by name or by recurringPaymentId
                const isDuplicate = existingItems.some(existing => existing.name.toLowerCase() === item.name.toLowerCase() ||
                    (item.recurringPaymentId && existing.recurringPaymentId === item.recurringPaymentId));
                if (!isDuplicate) {
                    await db.insert(budgetItems).values({
                        categoryId: targetCategoryId,
                        name: item.name,
                        planned: item.planned,
                        order: item.order,
                        recurringPaymentId: item.recurringPaymentId,
                    });
                }
            }
        }
    }
    // Sync recurring payments: create budget items for active recurring payments
    const activeRecurring = await db.query.recurringPayments.findMany({
        where: and(eq(recurringPayments.userId, userId), eq(recurringPayments.isActive, true)),
    });
    // Re-fetch target categories with items to check what already exists
    const updatedTarget = await fetchBudgetWithItems(targetBudget.id);
    if (updatedTarget) {
        for (const recurring of activeRecurring) {
            if (!recurring.categoryType)
                continue;
            const category = updatedTarget.categories.find(c => c.categoryType === recurring.categoryType);
            if (!category)
                continue;
            const existingItem = category.items.find(item => item.recurringPaymentId === recurring.id);
            if (existingItem)
                continue;
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
    return c.json({ success: true });
});
// POST /reset - Reset budget (zero out or replace with previous month)
route.post('/reset', async (c) => {
    const userId = getUserId(c);
    const db = await getDb();
    const body = await c.req.json();
    const { budgetId, mode } = body;
    if (!budgetId || !mode) {
        return c.json({ error: 'Missing required fields' }, 400);
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
        return c.json({ error: 'Budget not found' }, 404);
    }
    if (mode === 'zero') {
        // Set all planned amounts to 0
        const allItemIds = budget.categories.flatMap(c => c.items.map(i => i.id));
        if (allItemIds.length > 0) {
            await db.update(budgetItems)
                .set({ planned: '0' })
                .where(inArray(budgetItems.id, allItemIds));
        }
        return c.json({ success: true });
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
            return c.json({ error: 'Budget not found after cleanup' }, 500);
        }
        if (sourceBudget) {
            for (const sourceCategory of sourceBudget.categories) {
                let targetCategory = targetBudget.categories.find((c) => c.categoryType === sourceCategory.categoryType);
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
                        if (item.recurringPaymentId)
                            continue;
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
                if (!recurring.categoryType)
                    continue;
                const category = updatedTarget.categories.find(c => c.categoryType === recurring.categoryType);
                if (!category)
                    continue;
                const existingItem = category.items.find(item => item.recurringPaymentId === recurring.id);
                if (existingItem)
                    continue;
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
        return c.json({ success: true });
    }
    return c.json({ error: 'Invalid mode' }, 400);
});
// POST /demo - Load demo data for the current month
route.post('/demo', async (c) => {
    const userId = getUserId(c);
    const db = await getDb();
    const now = new Date();
    const month = now.getMonth(); // 0-indexed
    const year = now.getFullYear();
    // Check if budget with items already exists
    const existing = await db.query.budgets.findFirst({
        where: and(eq(budgets.userId, userId), eq(budgets.month, month), eq(budgets.year, year)),
        with: { categories: { with: { items: true } } },
    });
    if (existing) {
        const hasItems = existing.categories.some(c => c.items.length > 0);
        if (hasItems) {
            return c.json({ error: 'Budget already has data for this month' }, 409);
        }
        // Empty shell exists — delete it for a clean slate
        const catIds = existing.categories.map(c => c.id);
        if (catIds.length > 0) {
            await db.delete(budgetCategories).where(inArray(budgetCategories.id, catIds));
        }
        await db.delete(budgets).where(eq(budgets.id, existing.id));
    }
    // Create budget with demo buffer
    const [budget] = await db.insert(budgets).values({
        userId,
        month,
        year,
        buffer: String(DEMO_BUFFER),
    }).returning();
    // Create categories and items with transactions
    for (const cat of CATEGORY_TYPES) {
        const [category] = await db.insert(budgetCategories).values({
            budgetId: budget.id,
            categoryType: cat.type,
            name: cat.name,
        }).returning();
        const items = DEMO_DATA[cat.type] || [];
        for (let i = 0; i < items.length; i++) {
            const item = items[i];
            const [budgetItem] = await db.insert(budgetItems).values({
                categoryId: category.id,
                name: item.name,
                planned: String(item.planned),
                order: i,
            }).returning();
            for (const txn of item.transactions) {
                const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(txn.day).padStart(2, '0')}`;
                await db.insert(transactions).values({
                    budgetItemId: budgetItem.id,
                    date: dateStr,
                    description: txn.description,
                    amount: String(txn.amount),
                    type: txn.type,
                    merchant: txn.merchant || null,
                });
            }
        }
    }
    // Mark onboarding complete
    const existingOnboarding = await db.select().from(userOnboarding).where(eq(userOnboarding.userId, userId));
    if (existingOnboarding.length === 0) {
        await db.insert(userOnboarding).values({
            userId,
            currentStep: 6,
            completedAt: new Date(),
        });
    }
    else {
        await db.update(userOnboarding)
            .set({ currentStep: 6, completedAt: new Date() })
            .where(eq(userOnboarding.userId, userId));
    }
    // Return full budget
    const fullBudget = await fetchBudgetFull(budget.id);
    return c.json(fullBudget);
});
export default route;
