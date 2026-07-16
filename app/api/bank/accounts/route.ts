import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { linkedAccounts, transactions } from '@/db/schema';
import { eq, and } from 'drizzle-orm';
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

// New accounts are linked via POST /api/simplefin/claim

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

    // No provider-side revoke: SimpleFIN connections are managed on the Bridge site

    // Detach transactions (keep history as unlinked/manual) so the FK allows the delete
    await db
      .update(transactions)
      .set({ linkedAccountId: null })
      .where(eq(transactions.linkedAccountId, account.id));

    // Delete from database
    await db.delete(linkedAccounts).where(eq(linkedAccounts.id, account.id));

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting linked account:', error);
    return NextResponse.json({ error: 'Failed to delete linked account' }, { status: 500 });
  }
}
