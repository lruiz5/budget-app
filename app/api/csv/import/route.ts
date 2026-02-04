import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/db';
import { linkedAccounts, transactions, csvImportHashes } from '@/db/schema';
import { eq, and, inArray } from 'drizzle-orm';
import { requireAuth, isAuthError } from '@/lib/auth';
import { parseCsvWithMapping, computeTransactionHash } from '@/lib/csvParser';
import { CsvColumnMapping, CsvImportResult } from '@/types/csv';

export async function POST(request: NextRequest) {
  const authResult = await requireAuth();
  if (isAuthError(authResult)) return authResult.error;
  const { userId } = authResult;

  try {
    const db = await getDb();
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const accountId = formData.get('accountId') as string | null;

    if (!file) {
      return NextResponse.json(
        { error: 'No file provided' },
        { status: 400 }
      );
    }

    if (!accountId) {
      return NextResponse.json(
        { error: 'Account ID is required' },
        { status: 400 }
      );
    }

    // Verify account ownership and get column mapping
    const [account] = await db.select().from(linkedAccounts).where(
      and(
        eq(linkedAccounts.id, accountId),
        eq(linkedAccounts.userId, userId),
        eq(linkedAccounts.accountSource, 'csv')
      )
    );

    if (!account) {
      return NextResponse.json(
        { error: 'CSV account not found' },
        { status: 404 }
      );
    }

    if (!account.csvColumnMapping) {
      return NextResponse.json(
        { error: 'Account has no column mapping configured' },
        { status: 400 }
      );
    }

    const columnMapping: CsvColumnMapping = JSON.parse(account.csvColumnMapping);

    // Read and parse CSV
    const csvText = await file.text();
    const parseResult = parseCsvWithMapping(csvText, columnMapping);

    if (parseResult.transactions.length === 0 && parseResult.errors.length === 0) {
      return NextResponse.json(
        { error: 'No transactions found in CSV' },
        { status: 400 }
      );
    }

    // Compute hashes for all parsed transactions
    const transactionsWithHashes = parseResult.transactions.map(t => ({
      ...t,
      hash: computeTransactionHash(t.date, t.amount, t.description),
    }));

    // Batch fetch existing hashes for this account
    const hashesToCheck = transactionsWithHashes.map(t => t.hash);
    const existingHashes = hashesToCheck.length > 0
      ? await db.select({ hash: csvImportHashes.hash })
          .from(csvImportHashes)
          .where(
            and(
              eq(csvImportHashes.linkedAccountId, accountId),
              inArray(csvImportHashes.hash, hashesToCheck)
            )
          )
      : [];

    const existingHashSet = new Set(existingHashes.map((h: { hash: string }) => h.hash));

    // Filter out duplicates
    const newTransactions = transactionsWithHashes.filter(t => !existingHashSet.has(t.hash));
    const skippedCount = transactionsWithHashes.length - newTransactions.length;

    // Batch insert new transactions
    const insertedTransactions: { id: string; hash: string }[] = [];

    if (newTransactions.length > 0) {
      const transactionValues = newTransactions.map(t => ({
        linkedAccountId: accountId,
        date: t.date,
        description: t.description,
        amount: String(t.amount),
        type: t.type as 'income' | 'expense',
        merchant: t.merchant || t.description,
        status: (t.status || 'posted') as 'posted' | 'pending',
      }));

      const inserted = await db.insert(transactions).values(transactionValues).returning({ id: transactions.id });

      // Map inserted IDs back to hashes
      inserted.forEach((row: { id: string }, idx: number) => {
        insertedTransactions.push({
          id: row.id,
          hash: newTransactions[idx].hash,
        });
      });

      // Batch insert hashes
      if (insertedTransactions.length > 0) {
        const hashValues = insertedTransactions.map(t => ({
          linkedAccountId: accountId,
          hash: t.hash,
          transactionId: t.id,
        }));

        await db.insert(csvImportHashes).values(hashValues);
      }
    }

    // Update lastSyncedAt
    await db.update(linkedAccounts)
      .set({ lastSyncedAt: new Date() })
      .where(eq(linkedAccounts.id, accountId));

    const result: CsvImportResult = {
      imported: newTransactions.length,
      skipped: skippedCount,
      errors: parseResult.errors,
    };

    return NextResponse.json(result);
  } catch (error) {
    console.error('CSV import error:', error);
    return NextResponse.json(
      { error: 'Failed to import CSV' },
      { status: 500 }
    );
  }
}

// POST with preview mode - parse and show what would be imported without actually importing
export async function PUT(request: NextRequest) {
  const authResult = await requireAuth();
  if (isAuthError(authResult)) return authResult.error;
  const { userId } = authResult;

  try {
    const db = await getDb();
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const accountId = formData.get('accountId') as string | null;
    const columnMappingJson = formData.get('columnMapping') as string | null;

    if (!file) {
      return NextResponse.json(
        { error: 'No file provided' },
        { status: 400 }
      );
    }

    // Use either account's saved mapping or provided mapping
    let columnMapping: CsvColumnMapping | null = null;

    if (accountId) {
      const [account] = await db.select().from(linkedAccounts).where(
        and(
          eq(linkedAccounts.id, accountId),
          eq(linkedAccounts.userId, userId),
          eq(linkedAccounts.accountSource, 'csv')
        )
      );

      if (account?.csvColumnMapping) {
        columnMapping = JSON.parse(account.csvColumnMapping);
      }
    }

    if (columnMappingJson) {
      columnMapping = JSON.parse(columnMappingJson);
    }

    if (!columnMapping) {
      return NextResponse.json(
        { error: 'No column mapping provided' },
        { status: 400 }
      );
    }

    // Read and parse CSV
    const csvText = await file.text();
    const parseResult = parseCsvWithMapping(csvText, columnMapping);

    // Compute hashes and check for duplicates if account exists
    let duplicateCount = 0;

    if (accountId) {
      const hashes = parseResult.transactions.map(t =>
        computeTransactionHash(t.date, t.amount, t.description)
      );

      if (hashes.length > 0) {
        const existingHashes = await db.select({ hash: csvImportHashes.hash })
          .from(csvImportHashes)
          .where(
            and(
              eq(csvImportHashes.linkedAccountId, accountId),
              inArray(csvImportHashes.hash, hashes)
            )
          );

        duplicateCount = existingHashes.length;
      }
    }

    // Return preview with first 20 transactions
    return NextResponse.json({
      transactions: parseResult.transactions.slice(0, 20),
      totalCount: parseResult.transactions.length,
      duplicateCount,
      errors: parseResult.errors,
    });
  } catch (error) {
    console.error('CSV preview error:', error);
    return NextResponse.json(
      { error: 'Failed to preview CSV' },
      { status: 500 }
    );
  }
}
