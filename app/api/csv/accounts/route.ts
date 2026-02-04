import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/db';
import { linkedAccounts } from '@/db/schema';
import { eq, and } from 'drizzle-orm';
import { requireAuth, isAuthError } from '@/lib/auth';
import { CsvColumnMapping } from '@/types/csv';

// GET - List CSV accounts for the authenticated user
export async function GET() {
  const authResult = await requireAuth();
  if (isAuthError(authResult)) return authResult.error;
  const { userId } = authResult;

  try {
    const db = await getDb();
    const accounts = await db.select().from(linkedAccounts).where(
      and(
        eq(linkedAccounts.userId, userId),
        eq(linkedAccounts.accountSource, 'csv')
      )
    );

    // Parse the JSON column mapping for each account
    const accountsWithMapping = accounts.map((account: typeof linkedAccounts.$inferSelect) => ({
      ...account,
      csvColumnMapping: account.csvColumnMapping
        ? JSON.parse(account.csvColumnMapping) as CsvColumnMapping
        : null,
    }));

    return NextResponse.json(accountsWithMapping);
  } catch (error) {
    console.error('Failed to fetch CSV accounts:', error);
    return NextResponse.json(
      { error: 'Failed to fetch CSV accounts' },
      { status: 500 }
    );
  }
}

// POST - Create a new CSV account
export async function POST(request: NextRequest) {
  const authResult = await requireAuth();
  if (isAuthError(authResult)) return authResult.error;
  const { userId } = authResult;

  try {
    const db = await getDb();
    const body = await request.json();
    const { accountName, institutionName, columnMapping } = body as {
      accountName: string;
      institutionName: string;
      columnMapping: CsvColumnMapping;
    };

    // Validate required fields
    if (!accountName?.trim()) {
      return NextResponse.json(
        { error: 'Account name is required' },
        { status: 400 }
      );
    }

    if (!institutionName?.trim()) {
      return NextResponse.json(
        { error: 'Institution name is required' },
        { status: 400 }
      );
    }

    if (!columnMapping) {
      return NextResponse.json(
        { error: 'Column mapping is required' },
        { status: 400 }
      );
    }

    // Create the CSV account
    const [newAccount] = await db.insert(linkedAccounts).values({
      userId,
      accountSource: 'csv',
      accountName: accountName.trim(),
      institutionName: institutionName.trim(),
      accountType: 'csv',
      accountSubtype: 'csv_import',
      status: 'open',
      csvColumnMapping: JSON.stringify(columnMapping),
      // Teller fields left null for CSV accounts
    }).returning();

    return NextResponse.json({
      ...newAccount,
      csvColumnMapping: columnMapping,
    });
  } catch (error) {
    console.error('Failed to create CSV account:', error);
    return NextResponse.json(
      { error: 'Failed to create CSV account' },
      { status: 500 }
    );
  }
}

// PUT - Update an existing CSV account's column mapping
export async function PUT(request: NextRequest) {
  const authResult = await requireAuth();
  if (isAuthError(authResult)) return authResult.error;
  const { userId } = authResult;

  try {
    const db = await getDb();
    const body = await request.json();
    const { accountId, columnMapping, accountName, institutionName } = body as {
      accountId: string;
      columnMapping?: CsvColumnMapping;
      accountName?: string;
      institutionName?: string;
    };

    if (!accountId) {
      return NextResponse.json(
        { error: 'Account ID is required' },
        { status: 400 }
      );
    }

    // Verify ownership
    const [existingAccount] = await db.select().from(linkedAccounts).where(
      and(
        eq(linkedAccounts.id, accountId),
        eq(linkedAccounts.userId, userId),
        eq(linkedAccounts.accountSource, 'csv')
      )
    );

    if (!existingAccount) {
      return NextResponse.json(
        { error: 'CSV account not found' },
        { status: 404 }
      );
    }

    // Build update object
    const updates: Record<string, string> = {};
    if (columnMapping) {
      updates.csvColumnMapping = JSON.stringify(columnMapping);
    }
    if (accountName?.trim()) {
      updates.accountName = accountName.trim();
    }
    if (institutionName?.trim()) {
      updates.institutionName = institutionName.trim();
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json(
        { error: 'No updates provided' },
        { status: 400 }
      );
    }

    const [updatedAccount] = await db.update(linkedAccounts)
      .set(updates)
      .where(eq(linkedAccounts.id, accountId))
      .returning();

    return NextResponse.json({
      ...updatedAccount,
      csvColumnMapping: updatedAccount.csvColumnMapping
        ? JSON.parse(updatedAccount.csvColumnMapping)
        : null,
    });
  } catch (error) {
    console.error('Failed to update CSV account:', error);
    return NextResponse.json(
      { error: 'Failed to update CSV account' },
      { status: 500 }
    );
  }
}

// DELETE - Delete a CSV account (keeps transactions, just removes the mapping)
export async function DELETE(request: NextRequest) {
  const authResult = await requireAuth();
  if (isAuthError(authResult)) return authResult.error;
  const { userId } = authResult;

  try {
    const db = await getDb();
    const { searchParams } = new URL(request.url);
    const accountId = searchParams.get('id');

    if (!accountId) {
      return NextResponse.json(
        { error: 'Account ID is required' },
        { status: 400 }
      );
    }

    // Verify ownership
    const [existingAccount] = await db.select().from(linkedAccounts).where(
      and(
        eq(linkedAccounts.id, accountId),
        eq(linkedAccounts.userId, userId),
        eq(linkedAccounts.accountSource, 'csv')
      )
    );

    if (!existingAccount) {
      return NextResponse.json(
        { error: 'CSV account not found' },
        { status: 404 }
      );
    }

    // Delete the account (transactions remain with linkedAccountId pointing to deleted account)
    // The csvImportHashes will cascade delete due to FK constraint
    await db.delete(linkedAccounts).where(eq(linkedAccounts.id, accountId));

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to delete CSV account:', error);
    return NextResponse.json(
      { error: 'Failed to delete CSV account' },
      { status: 500 }
    );
  }
}
