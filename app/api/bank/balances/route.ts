import { NextResponse } from 'next/server';
import { db } from '@/db';
import { linkedAccounts } from '@/db/schema';
import { and, eq } from 'drizzle-orm';
import { getAccounts } from '@/lib/simplefin';
import { requireAuth, isAuthError } from '@/lib/auth';

// GET - Fetch live balances from the provider for all linked accounts
export async function GET() {
  try {
    const authResult = await requireAuth();
    if (isAuthError(authResult)) return authResult.error;
    const { userId } = authResult;

    const accounts = await db
      .select()
      .from(linkedAccounts)
      .where(and(eq(linkedAccounts.userId, userId), eq(linkedAccounts.provider, 'simplefin')));

    const balances: Record<string, string> = {};

    // One balances-only call per access URL covers all its accounts
    const accessUrls = [...new Set(accounts.map(a => a.accessToken))];
    const fetches = accessUrls.map(async (accessUrl) => {
      try {
        const accountSet = await getAccounts(accessUrl, { balancesOnly: true });
        const balanceByProviderId = new Map(accountSet.accounts.map(a => [a.id, a.balance]));
        for (const account of accounts) {
          const balance = balanceByProviderId.get(account.tellerAccountId);
          if (balance !== undefined) {
            balances[String(account.id)] = balance;
          }
        }
      } catch {
        // Skip connections that fail (e.g. revoked access URL)
      }
    });

    await Promise.all(fetches);

    return NextResponse.json(balances);
  } catch (error) {
    console.error('Error fetching balances:', error);
    return NextResponse.json({ error: 'Failed to fetch balances' }, { status: 500 });
  }
}
