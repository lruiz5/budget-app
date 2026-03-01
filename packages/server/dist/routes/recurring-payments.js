import { Hono } from 'hono';
import { getDb } from '@budget-app/shared/db';
import { recurringPayments, budgetItems, transactions } from '@budget-app/shared/schema';
import { eq, desc, and, isNull } from 'drizzle-orm';
import { getUserId } from '../middleware/auth';
// Helper to calculate months in a frequency cycle (for expense accumulation)
function getMonthsInCycle(frequency) {
    switch (frequency) {
        case 'monthly': return 1;
        case 'quarterly': return 3;
        case 'semi-annually': return 6;
        case 'annually': return 12;
        default: return 1;
    }
}
// Helper to calculate the monthly equivalent amount
function getMonthlyEquivalent(amount, frequency) {
    switch (frequency) {
        case 'weekly': return amount * 4;
        case 'bi-weekly': return amount * 2;
        case 'monthly': return amount;
        case 'quarterly': return amount / 3;
        case 'semi-annually': return amount / 6;
        case 'annually': return amount / 12;
        default: return amount;
    }
}
// Helper to calculate days until due (parse YYYY-MM-DD as local to avoid UTC shift)
function getDaysUntilDue(nextDueDate) {
    const [y, m, d] = nextDueDate.split('-').map(Number);
    const due = new Date(y, m - 1, d);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    due.setHours(0, 0, 0, 0);
    const diffTime = due.getTime() - today.getTime();
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
}
// Helper to calculate next due date based on frequency
function getNextDueDate(currentDueDate, frequency) {
    const [y, m, d] = currentDueDate.split('-').map(Number);
    const date = new Date(y, m - 1, d);
    switch (frequency) {
        case 'monthly':
            date.setMonth(date.getMonth() + 1);
            break;
        case 'quarterly':
            date.setMonth(date.getMonth() + 3);
            break;
        case 'semi-annually':
            date.setMonth(date.getMonth() + 6);
            break;
        case 'annually':
            date.setFullYear(date.getFullYear() + 1);
            break;
    }
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
// Transform DB record to RecurringPayment with computed fields
function transformToRecurringPayment(record, calculatedFundedAmount, isMonthly, isIncome) {
    const frequency = record.frequency;
    const monthsInCycle = getMonthsInCycle(frequency);
    const amountNum = parseFloat(String(record.amount));
    const fundedAmount = calculatedFundedAmount !== undefined ? calculatedFundedAmount : parseFloat(String(record.fundedAmount));
    let monthlyContribution;
    let displayTarget;
    if (isIncome) {
        monthlyContribution = getMonthlyEquivalent(amountNum, frequency);
        displayTarget = monthlyContribution;
    }
    else if (isMonthly) {
        monthlyContribution = amountNum / monthsInCycle;
        displayTarget = monthlyContribution;
    }
    else {
        monthlyContribution = amountNum / monthsInCycle;
        displayTarget = amountNum;
    }
    const percentFunded = displayTarget > 0 ? (fundedAmount / displayTarget) * 100 : 0;
    const isPaid = fundedAmount >= displayTarget;
    return {
        id: record.id,
        name: record.name,
        amount: amountNum,
        frequency,
        nextDueDate: record.nextDueDate,
        fundedAmount,
        categoryType: record.categoryType,
        isActive: record.isActive,
        createdAt: record.createdAt || undefined,
        updatedAt: record.updatedAt || undefined,
        monthlyContribution,
        displayTarget,
        percentFunded: Math.min(percentFunded, 100),
        isFullyFunded: isPaid,
        daysUntilDue: getDaysUntilDue(record.nextDueDate),
        isPaid,
    };
}
const route = new Hono();
// GET / - List all active recurring payments with computed fields
route.get('/', async (c) => {
    const userId = getUserId(c);
    const db = await getDb();
    const payments = await db.query.recurringPayments.findMany({
        where: and(eq(recurringPayments.userId, userId), eq(recurringPayments.isActive, true), isNull(recurringPayments.deletedAt)),
        orderBy: [desc(recurringPayments.nextDueDate)],
    });
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();
    const transformed = await Promise.all(payments.map(async (p) => {
        const isMonthly = p.frequency === 'monthly';
        const isIncome = p.categoryType === 'income';
        const linkedItems = await db.query.budgetItems.findMany({
            where: eq(budgetItems.recurringPaymentId, p.id),
            with: {
                category: {
                    with: { budget: true },
                },
                transactions: {
                    where: isNull(transactions.deletedAt),
                },
                splitTransactions: true,
            },
        });
        let fundedAmount = 0;
        if (isMonthly || isIncome) {
            for (const item of linkedItems) {
                if (item.category?.budget?.month === currentMonth &&
                    item.category?.budget?.year === currentYear) {
                    const txnTotal = item.transactions.reduce((sum, t) => sum + Math.abs(parseFloat(String(t.amount))), 0);
                    const splitTotal = item.splitTransactions.reduce((sum, s) => sum + Math.abs(parseFloat(String(s.amount))), 0);
                    fundedAmount = txnTotal + splitTotal;
                    break;
                }
            }
        }
        else {
            for (const item of linkedItems) {
                const txnTotal = item.transactions.reduce((sum, t) => sum + Math.abs(parseFloat(String(t.amount))), 0);
                const splitTotal = item.splitTransactions.reduce((sum, s) => sum + Math.abs(parseFloat(String(s.amount))), 0);
                fundedAmount += txnTotal + splitTotal;
            }
        }
        return transformToRecurringPayment(p, fundedAmount, isMonthly, isIncome);
    }));
    transformed.sort((a, b) => a.daysUntilDue - b.daysUntilDue);
    return c.json(transformed);
});
// POST / - Create a new recurring payment
route.post('/', async (c) => {
    const userId = getUserId(c);
    const db = await getDb();
    const body = await c.req.json();
    const { name, amount, frequency, nextDueDate, categoryType, budgetItemId } = body;
    if (!name || !amount || !frequency || !nextDueDate) {
        return c.json({ error: 'Missing required fields' }, 400);
    }
    const [payment] = await db
        .insert(recurringPayments)
        .values({
        userId,
        name,
        amount: String(parseFloat(amount)),
        frequency,
        nextDueDate,
        categoryType: categoryType || null,
        fundedAmount: '0',
        isActive: true,
    })
        .returning();
    // If a budget item ID was provided, link it to this recurring payment
    if (budgetItemId) {
        await db
            .update(budgetItems)
            .set({ recurringPaymentId: payment.id })
            .where(eq(budgetItems.id, budgetItemId));
    }
    return c.json(transformToRecurringPayment(payment));
});
// PUT / - Update a recurring payment
route.put('/', async (c) => {
    const userId = getUserId(c);
    const db = await getDb();
    const body = await c.req.json();
    const { id, name, amount, frequency, nextDueDate, fundedAmount, categoryType, isActive } = body;
    if (!id) {
        return c.json({ error: 'Missing payment id' }, 400);
    }
    const existing = await db.query.recurringPayments.findFirst({
        where: and(eq(recurringPayments.id, id), eq(recurringPayments.userId, userId)),
    });
    if (!existing) {
        return c.json({ error: 'Recurring payment not found' }, 404);
    }
    const updates = {
        updatedAt: new Date(),
    };
    if (name !== undefined)
        updates.name = name;
    if (amount !== undefined)
        updates.amount = String(parseFloat(amount));
    if (frequency !== undefined)
        updates.frequency = frequency;
    if (nextDueDate !== undefined)
        updates.nextDueDate = nextDueDate;
    if (fundedAmount !== undefined)
        updates.fundedAmount = String(parseFloat(fundedAmount));
    if (categoryType !== undefined)
        updates.categoryType = categoryType || null;
    if (isActive !== undefined)
        updates.isActive = isActive;
    const [payment] = await db
        .update(recurringPayments)
        .set(updates)
        .where(eq(recurringPayments.id, id))
        .returning();
    return c.json(transformToRecurringPayment(payment));
});
// DELETE / - Delete a recurring payment
route.delete('/', async (c) => {
    const userId = getUserId(c);
    const db = await getDb();
    const id = c.req.query('id');
    if (!id) {
        return c.json({ error: 'Missing payment id' }, 400);
    }
    const existing = await db.query.recurringPayments.findFirst({
        where: and(eq(recurringPayments.id, id), eq(recurringPayments.userId, userId)),
    });
    if (!existing) {
        return c.json({ error: 'Recurring payment not found' }, 404);
    }
    // First, unlink any budget items that reference this recurring payment
    await db
        .update(budgetItems)
        .set({ recurringPaymentId: null, updatedAt: new Date() })
        .where(eq(budgetItems.recurringPaymentId, id));
    // Soft delete the recurring payment
    await db.update(recurringPayments)
        .set({ deletedAt: new Date(), updatedAt: new Date() })
        .where(eq(recurringPayments.id, id));
    return c.json({ success: true });
});
// ============================================================================
// SUB-ROUTES
// ============================================================================
// POST /contribute - Add contribution to recurring payment's funded amount
route.post('/contribute', async (c) => {
    const userId = getUserId(c);
    const db = await getDb();
    const body = await c.req.json();
    const { id, amount } = body;
    if (!id || amount === undefined) {
        return c.json({ error: 'Missing required fields' }, 400);
    }
    const payment = await db.query.recurringPayments.findFirst({
        where: and(eq(recurringPayments.id, id), eq(recurringPayments.userId, userId)),
    });
    if (!payment) {
        return c.json({ error: 'Payment not found' }, 404);
    }
    const newFundedAmount = Math.max(0, parseFloat(String(payment.fundedAmount)) + parseFloat(amount));
    const [updated] = await db
        .update(recurringPayments)
        .set({
        fundedAmount: String(newFundedAmount),
        updatedAt: new Date(),
    })
        .where(eq(recurringPayments.id, id))
        .returning();
    return c.json({
        success: true,
        payment: updated,
    });
});
// POST /reset - Mark payment as paid and advance to next cycle
route.post('/reset', async (c) => {
    const userId = getUserId(c);
    const db = await getDb();
    const body = await c.req.json();
    const { id } = body;
    if (!id) {
        return c.json({ error: 'Missing payment id' }, 400);
    }
    const payment = await db.query.recurringPayments.findFirst({
        where: and(eq(recurringPayments.id, id), eq(recurringPayments.userId, userId)),
    });
    if (!payment) {
        return c.json({ error: 'Payment not found' }, 404);
    }
    const nextDate = getNextDueDate(payment.nextDueDate, payment.frequency);
    const [updated] = await db
        .update(recurringPayments)
        .set({
        nextDueDate: nextDate,
        fundedAmount: '0',
        updatedAt: new Date(),
    })
        .where(eq(recurringPayments.id, id))
        .returning();
    return c.json({
        success: true,
        payment: updated,
    });
});
export default route;
