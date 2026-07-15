import { NextResponse } from 'next/server';
import { db } from '@/db';
import { linkedAccounts } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { createTellerClient } from '@/lib/teller';
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
      .where(eq(linkedAccounts.userId, userId));

    const balances: Record<string, string> = {};

    const tellerAccounts = accounts.filter(a => a.provider !== 'simplefin');
    const simplefinAccounts = accounts.filter(a => a.provider === 'simplefin');

    // SimpleFIN: one balances-only call per access URL covers all its accounts
    const accessUrls = [...new Set(simplefinAccounts.map(a => a.accessToken))];
    const simplefinFetches = accessUrls.map(async (accessUrl) => {
      try {
        const accountSet = await getAccounts(accessUrl, { balancesOnly: true });
        const balanceByProviderId = new Map(accountSet.accounts.map(a => [a.id, a.balance]));
        for (const account of simplefinAccounts) {
          const balance = balanceByProviderId.get(account.tellerAccountId);
          if (balance !== undefined) {
            balances[String(account.id)] = balance;
          }
        }
      } catch {
        // Skip connections that fail (e.g. revoked access URL)
      }
    });

    const tellerFetches = tellerAccounts.map(async (account) => {
      try {
        const tellerClient = createTellerClient(account.accessToken);
        const balance = await tellerClient.getAccountBalance(account.tellerAccountId);
        balances[String(account.id)] = balance.ledger;
      } catch {
        // Skip accounts that fail (e.g. closed/revoked)
      }
    });

    await Promise.all([...simplefinFetches, ...tellerFetches]);

    return NextResponse.json(balances);
  } catch (error) {
    console.error('Error fetching balances:', error);
    return NextResponse.json({ error: 'Failed to fetch balances' }, { status: 500 });
  }
}
