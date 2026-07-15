import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { linkedAccounts } from '@/db/schema';
import { eq, and } from 'drizzle-orm';
import { claimAccessUrl, getAccounts, SimpleFINAccount } from '@/lib/simplefin';
import { requireAuth, isAuthError } from '@/lib/auth';

// Best-effort "•••• 1234" support: SimpleFIN has no last_four field,
// but many institutions put trailing digits in the account name
function extractLastFour(accountName: string): string {
  const match = accountName.match(/(\d{4})\s*$/);
  return match ? match[1] : '';
}

function institutionName(account: SimpleFINAccount): string {
  return account.org?.name || account.org?.domain || 'SimpleFIN';
}

// POST - Claim a SimpleFIN Setup Token and save the connection's accounts
export async function POST(request: NextRequest) {
  try {
    const authResult = await requireAuth();
    if (isAuthError(authResult)) return authResult.error;
    const { userId } = authResult;

    const body = await request.json();
    const { setupToken, syncStartDate } = body as { setupToken?: string; syncStartDate?: string };

    if (!setupToken || !setupToken.trim()) {
      return NextResponse.json({ error: 'Setup token is required' }, { status: 400 });
    }

    // Setup tokens are one-time-use; also accept a raw access URL
    // (e.g. reconnecting a connection claimed elsewhere)
    let accessUrl: string;
    try {
      accessUrl = /^https?:\/\//.test(setupToken.trim())
        ? setupToken.trim()
        : await claimAccessUrl(setupToken);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Invalid setup token';
      return NextResponse.json({ error: message }, { status: 400 });
    }

    // Enumerate accounts without pulling transaction history
    const accountSet = await getAccounts(accessUrl, { balancesOnly: true });

    if (accountSet.accounts.length === 0) {
      return NextResponse.json(
        { error: 'No accounts found for this token. Connect your bank on the SimpleFIN Bridge site first.' },
        { status: 400 }
      );
    }

    const effectiveSyncStartDate =
      syncStartDate && /^\d{4}-\d{2}-\d{2}$/.test(syncStartDate)
        ? syncStartDate
        : new Date().toISOString().split('T')[0];

    const savedAccounts = [];
    for (const account of accountSet.accounts) {
      const existing = await db
        .select()
        .from(linkedAccounts)
        .where(and(eq(linkedAccounts.tellerAccountId, account.id), eq(linkedAccounts.userId, userId)))
        .limit(1);

      if (existing.length > 0) {
        // Reconnect: refresh the access URL and metadata, keep sync settings
        const [updated] = await db
          .update(linkedAccounts)
          .set({
            accessToken: accessUrl,
            institutionName: institutionName(account),
            accountName: account.name,
            status: 'open',
          })
          .where(eq(linkedAccounts.id, existing[0].id))
          .returning();
        savedAccounts.push({ ...updated, updated: true });
      } else {
        const [newAccount] = await db
          .insert(linkedAccounts)
          .values({
            userId,
            provider: 'simplefin',
            tellerAccountId: account.id,
            tellerEnrollmentId: 'simplefin',
            accessToken: accessUrl,
            institutionName: institutionName(account),
            institutionId: account.org?.domain || account.org?.['sfin-url'] || 'simplefin',
            accountName: account.name,
            accountType: 'depository',
            accountSubtype: 'account',
            lastFour: extractLastFour(account.name),
            status: 'open',
            syncEnabled: true,
            syncStartDate: effectiveSyncStartDate,
          })
          .returning();
        savedAccounts.push(newAccount);
      }
    }

    return NextResponse.json({ accounts: savedAccounts });
  } catch (error) {
    console.error('Error claiming SimpleFIN token:', error);
    const message = error instanceof Error ? error.message : 'Failed to connect SimpleFIN';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
