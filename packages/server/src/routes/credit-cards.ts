import { Hono } from 'hono';
import { getDb } from '@budget-app/shared/db';
import { linkedAccounts, transactions } from '@budget-app/shared/schema';
import { eq, and, isNull, sql } from 'drizzle-orm';
import { getUserId } from '../middleware/auth';
import type { AppEnv } from '../types';

const route = new Hono<AppEnv>();

// GET /summary - Get credit card summaries with balances and payment info
route.get('/summary', async (c) => {
  try {
    const userId = getUserId(c);
    const db = await getDb();

    // Fetch all credit card accounts for this user
    const creditAccounts = await db
      .select()
      .from(linkedAccounts)
      .where(and(
        eq(linkedAccounts.userId, userId),
        eq(linkedAccounts.accountType, 'credit'),
        isNull(linkedAccounts.deletedAt)
      ));

    if (creditAccounts.length === 0) {
      return c.json([]);
    }

    const now = new Date();
    const currentMonth = now.getMonth(); // 0-indexed
    const currentYear = now.getFullYear();

    // Build start/end date strings for current month filtering
    const monthStart = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-01`;
    const nextMonth = currentMonth === 11 ? 1 : currentMonth + 2;
    const nextYear = currentMonth === 11 ? currentYear + 1 : currentYear;
    const monthEnd = `${nextYear}-${String(nextMonth).padStart(2, '0')}-01`;

    const summaries = [];

    for (const account of creditAccounts) {
      // Get this month's charges (non-transfer, non-deleted expense transactions)
      const chargesResult = await db
        .select({ total: sql<string>`COALESCE(SUM(${transactions.amount}), '0')` })
        .from(transactions)
        .where(and(
          eq(transactions.linkedAccountId, account.id),
          eq(transactions.type, 'expense'),
          eq(transactions.isTransfer, false),
          isNull(transactions.deletedAt),
          sql`${transactions.date} >= ${monthStart}`,
          sql`${transactions.date} < ${monthEnd}`
        ));

      const monthlyCharges = parseFloat(String(chargesResult[0]?.total || '0'));

      // Get recent payments (transfer transactions to this card, last 90 days)
      const ninetyDaysAgo = new Date();
      ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
      const cutoffDate = ninetyDaysAgo.toISOString().split('T')[0];

      const recentPayments = await db
        .select()
        .from(transactions)
        .where(and(
          eq(transactions.linkedAccountId, account.id),
          eq(transactions.isTransfer, true),
          isNull(transactions.deletedAt),
          sql`${transactions.date} >= ${cutoffDate}`
        ))
        .orderBy(sql`${transactions.date} DESC`)
        .limit(10);

      const currentBalance = parseFloat(String(account.currentBalance || '0'));
      const creditLimit = parseFloat(String(account.creditLimit || '0'));
      const utilization = creditLimit > 0 ? (currentBalance / creditLimit) * 100 : 0;

      summaries.push({
        accountId: account.id,
        accountName: account.accountName,
        institutionName: account.institutionName,
        lastFour: account.lastFour || '',
        currentBalance,
        availableBalance: parseFloat(String(account.availableBalance || '0')),
        creditLimit,
        minimumPayment: parseFloat(String(account.minimumPayment || '0')),
        paymentDueDate: account.paymentDueDate || null,
        balanceUpdatedAt: account.balanceUpdatedAt?.toISOString() || null,
        utilization: Math.round(utilization * 10) / 10,
        recentPayments: recentPayments.map(p => ({
          id: p.id,
          date: p.date,
          description: p.description,
          amount: parseFloat(String(p.amount)),
          type: p.type,
          merchant: p.merchant,
        })),
        monthlyCharges,
      });
    }

    return c.json(summaries);
  } catch (error) {
    console.error('Error fetching credit card summaries:', error);
    return c.json({ error: 'Failed to fetch credit card summaries' }, 500);
  }
});

// PUT /:id - Update user-editable credit card fields
route.put('/:id', async (c) => {
  try {
    const userId = getUserId(c);
    const db = await getDb();
    const accountId = c.req.param('id');
    const body = await c.req.json();

    // Verify ownership
    const [account] = await db
      .select()
      .from(linkedAccounts)
      .where(and(
        eq(linkedAccounts.id, accountId),
        eq(linkedAccounts.userId, userId),
        eq(linkedAccounts.accountType, 'credit')
      ))
      .limit(1);

    if (!account) {
      return c.json({ error: 'Credit card account not found' }, 404);
    }

    const updates: Record<string, any> = { updatedAt: new Date() };

    if (body.creditLimit !== undefined) {
      updates.creditLimit = String(body.creditLimit);
    }
    if (body.minimumPayment !== undefined) {
      updates.minimumPayment = String(body.minimumPayment);
    }
    if (body.paymentDueDate !== undefined) {
      updates.paymentDueDate = body.paymentDueDate;
    }

    await db.update(linkedAccounts)
      .set(updates)
      .where(eq(linkedAccounts.id, accountId));

    return c.json({ success: true });
  } catch (error) {
    console.error('Error updating credit card:', error);
    return c.json({ error: 'Failed to update credit card' }, 500);
  }
});

export default route;
