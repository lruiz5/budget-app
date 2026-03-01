import { NextResponse } from 'next/server';
import { db } from '@/db';
import { linkedAccounts } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { createTellerClient } from '@/lib/teller';
import { requireAuth, isAuthError } from '@/lib/auth';

// GET - Fetch live balances from Teller for all linked accounts
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

    await Promise.all(
      accounts.map(async (account) => {
        try {
          const tellerClient = createTellerClient(account.accessToken);
          const balance = await tellerClient.getAccountBalance(account.tellerAccountId);
          balances[String(account.id)] = balance.ledger;
        } catch {
          // Skip accounts that fail (e.g. closed/revoked)
        }
      })
    );

    return NextResponse.json(balances);
  } catch (error) {
    console.error('Error fetching balances:', error);
    return NextResponse.json({ error: 'Failed to fetch balances' }, { status: 500 });
  }
}
