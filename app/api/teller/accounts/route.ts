import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { linkedAccounts } from '@/db/schema';
import { eq, and } from 'drizzle-orm';
import { createTellerClient, TellerAccount } from '@/lib/teller';
import { requireAuth, isAuthError } from '@/lib/auth';

// GET - List all linked accounts from database
export async function GET(request: NextRequest) {
  try {
    const authResult = await requireAuth();
    if (isAuthError(authResult)) return authResult.error;
    const { userId } = authResult;

    const accounts = await db.select().from(linkedAccounts).where(eq(linkedAccounts.userId, userId));
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
        // Insert new account (sync enabled by default, starting from today)
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
            syncEnabled: true,
            syncStartDate: new Date().toISOString().split('T')[0],
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

// PATCH - Update account settings (sync toggle)
export async function PATCH(request: NextRequest) {
  try {
    const authResult = await requireAuth();
    if (isAuthError(authResult)) return authResult.error;
    const { userId } = authResult;

    const body = await request.json();
    const { id, syncEnabled } = body;

    if (!id) {
      return NextResponse.json({ error: 'Account ID is required' }, { status: 400 });
    }

    // Verify ownership
    const [account] = await db
      .select()
      .from(linkedAccounts)
      .where(and(eq(linkedAccounts.id, id), eq(linkedAccounts.userId, userId)))
      .limit(1);

    if (!account) {
      return NextResponse.json({ error: 'Account not found' }, { status: 404 });
    }

    const updates: Record<string, unknown> = {};

    if (syncEnabled !== undefined) {
      updates.syncEnabled = syncEnabled;
      // Set syncStartDate to today when first enabling (don't overwrite if re-enabling)
      if (syncEnabled && !account.syncStartDate) {
        updates.syncStartDate = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
      }
    }

    const [updated] = await db
      .update(linkedAccounts)
      .set(updates)
      .where(eq(linkedAccounts.id, id))
      .returning();

    return NextResponse.json(updated);
  } catch (error) {
    console.error('Error updating linked account:', error);
    return NextResponse.json({ error: 'Failed to update linked account' }, { status: 500 });
  }
}

// DELETE - Remove a linked account
export async function DELETE(request: NextRequest) {
  try {
    const authResult = await requireAuth();
    if (isAuthError(authResult)) return authResult.error;
    const { userId } = authResult;

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'Account ID is required' }, { status: 400 });
    }

    // Get the account and verify ownership
    const [account] = await db
      .select()
      .from(linkedAccounts)
      .where(and(eq(linkedAccounts.id, parseInt(id)), eq(linkedAccounts.userId, userId)))
      .limit(1);

    if (!account) {
      return NextResponse.json({ error: 'Account not found' }, { status: 404 });
    }

    // Optionally disconnect from Teller (revoke access)
    try {
      const tellerClient = createTellerClient(account.accessToken);
      await tellerClient.deleteAccount(account.tellerAccountId);
    } catch {
      // Continue even if Teller API fails - we still want to remove from our DB
      console.warn('Failed to disconnect account from Teller API');
    }

    // Delete from database
    await db.delete(linkedAccounts).where(eq(linkedAccounts.id, parseInt(id)));

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting linked account:', error);
    return NextResponse.json({ error: 'Failed to delete linked account' }, { status: 500 });
  }
}
