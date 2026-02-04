import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/db';
import { linkedAccounts } from '@/db/schema';
import { eq, and } from 'drizzle-orm';
import { createTellerClient, TellerAccount } from '@/lib/teller';
import { requireAuth, isAuthError } from '@/lib/auth';

// GET - List all linked Teller accounts from database
export async function GET(request: NextRequest) {
  try {
    const authResult = await requireAuth();
    if (isAuthError(authResult)) return authResult.error;
    const { userId } = authResult;

    const db = await getDb();
    // Only return Teller accounts (not CSV accounts)
    const accounts = await db.select().from(linkedAccounts).where(
      and(eq(linkedAccounts.userId, userId), eq(linkedAccounts.accountSource, 'teller'))
    );
    return NextResponse.json(accounts);
  } catch (error) {
    console.error('Error fetching linked accounts:', error);
    return NextResponse.json({ error: 'Failed to fetch linked accounts' }, { status: 500 });
  }
}

// POST - Save a new linked account after Teller Connect enrollment
export async function POST(request: NextRequest) {
  try {
    const authResult = await requireAuth();
    if (isAuthError(authResult)) return authResult.error;
    const { userId } = authResult;

    const db = await getDb();
    const body = await request.json();
    const { accessToken, enrollment } = body;

    if (!accessToken) {
      return NextResponse.json({ error: 'Access token is required' }, { status: 400 });
    }

    // Fetch accounts from Teller API using the access token
    const tellerClient = createTellerClient(accessToken);
    const tellerAccounts: TellerAccount[] = await tellerClient.listAccounts();

    // Save each account to the database
    const savedAccounts = [];
    for (const account of tellerAccounts) {
      // Check if account already exists for this user
      const existing = await db
        .select()
        .from(linkedAccounts)
        .where(and(eq(linkedAccounts.tellerAccountId, account.id), eq(linkedAccounts.userId, userId)))
        .limit(1);

      if (existing.length > 0) {
        // Update existing account
        await db
          .update(linkedAccounts)
          .set({
            accessToken,
            institutionName: account.institution.name,
            accountName: account.name,
            status: account.status,
          })
          .where(eq(linkedAccounts.tellerAccountId, account.id));
        savedAccounts.push({ ...existing[0], updated: true });
      } else {
        // Insert new account
        const [newAccount] = await db
          .insert(linkedAccounts)
          .values({
            userId,
            tellerAccountId: account.id,
            tellerEnrollmentId: enrollment?.id || account.enrollment_id,
            accessToken,
            institutionName: account.institution.name,
            institutionId: account.institution.id,
            accountName: account.name,
            accountType: account.type,
            accountSubtype: account.subtype,
            lastFour: account.last_four,
            status: account.status,
          })
          .returning();
        savedAccounts.push(newAccount);
      }
    }

    return NextResponse.json({ accounts: savedAccounts });
  } catch (error) {
    console.error('Error saving linked account:', error);
    return NextResponse.json({ error: 'Failed to save linked account' }, { status: 500 });
  }
}

// DELETE - Remove a linked account
export async function DELETE(request: NextRequest) {
  try {
    const authResult = await requireAuth();
    if (isAuthError(authResult)) return authResult.error;
    const { userId } = authResult;

    const db = await getDb();
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'Account ID is required' }, { status: 400 });
    }

    // Get the account and verify ownership
    const [account] = await db
      .select()
      .from(linkedAccounts)
      .where(and(eq(linkedAccounts.id, id), eq(linkedAccounts.userId, userId)))
      .limit(1);

    if (!account) {
      return NextResponse.json({ error: 'Account not found' }, { status: 404 });
    }

    // Optionally disconnect from Teller (revoke access) - only for Teller accounts
    if (account.accessToken && account.tellerAccountId) {
      try {
        const tellerClient = createTellerClient(account.accessToken);
        await tellerClient.deleteAccount(account.tellerAccountId);
      } catch {
        // Continue even if Teller API fails - we still want to remove from our DB
        console.warn('Failed to disconnect account from Teller API');
      }
    }

    // Delete from database
    await db.delete(linkedAccounts).where(eq(linkedAccounts.id, id));

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting linked account:', error);
    return NextResponse.json({ error: 'Failed to delete linked account' }, { status: 500 });
  }
}
