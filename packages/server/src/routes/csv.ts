import { Hono } from 'hono';
import { getDb } from '@budget-app/shared/db';
import { linkedAccounts, transactions, csvImportHashes } from '@budget-app/shared/schema';
import { eq, and, inArray, isNull } from 'drizzle-orm';
import { getUserId } from '../middleware/auth';
import { parseCsvText, detectColumnMapping, detectDateFormat, parseCsvWithMapping, computeTransactionHash } from '../lib/csvParser';
import type { CsvColumnMapping, CsvPreviewResponse, CsvImportResult } from '@budget-app/shared/types';
import type { AppEnv } from '../types';

const route = new Hono<AppEnv>();

// ============================================================================
// ACCOUNTS
// ============================================================================

// GET /accounts - List CSV accounts for the authenticated user
route.get('/accounts', async (c) => {
  const userId = getUserId(c);

  try {
    const db = await getDb();
    const accounts = await db.select().from(linkedAccounts).where(
      and(
        eq(linkedAccounts.userId, userId),
        eq(linkedAccounts.accountSource, 'csv'),
        isNull(linkedAccounts.deletedAt)
      )
    );

    // Parse the JSON column mapping for each account
    const accountsWithMapping = accounts.map((account: typeof linkedAccounts.$inferSelect) => ({
      ...account,
      csvColumnMapping: account.csvColumnMapping
        ? JSON.parse(account.csvColumnMapping) as CsvColumnMapping
        : null,
    }));

    return c.json(accountsWithMapping);
  } catch (error) {
    console.error('Failed to fetch CSV accounts:', error);
    return c.json({ error: 'Failed to fetch CSV accounts' }, 500);
  }
});

// POST /accounts - Create a new CSV account
route.post('/accounts', async (c) => {
  const userId = getUserId(c);

  try {
    const db = await getDb();
    const body = await c.req.json();
    const { accountName, institutionName, columnMapping } = body as {
      accountName: string;
      institutionName: string;
      columnMapping: CsvColumnMapping;
    };

    if (!accountName?.trim()) {
      return c.json({ error: 'Account name is required' }, 400);
    }

    if (!institutionName?.trim()) {
      return c.json({ error: 'Institution name is required' }, 400);
    }

    if (!columnMapping) {
      return c.json({ error: 'Column mapping is required' }, 400);
    }

    const [newAccount] = await db.insert(linkedAccounts).values({
      userId,
      accountSource: 'csv',
      accountName: accountName.trim(),
      institutionName: institutionName.trim(),
      accountType: 'csv',
      accountSubtype: 'csv_import',
      status: 'open',
      csvColumnMapping: JSON.stringify(columnMapping),
    }).returning();

    return c.json({
      ...newAccount,
      csvColumnMapping: columnMapping,
    });
  } catch (error) {
    console.error('Failed to create CSV account:', error);
    return c.json({ error: 'Failed to create CSV account' }, 500);
  }
});

// PUT /accounts - Update an existing CSV account's column mapping
route.put('/accounts', async (c) => {
  const userId = getUserId(c);

  try {
    const db = await getDb();
    const body = await c.req.json();
    const { accountId, columnMapping, accountName, institutionName } = body as {
      accountId: string;
      columnMapping?: CsvColumnMapping;
      accountName?: string;
      institutionName?: string;
    };

    if (!accountId) {
      return c.json({ error: 'Account ID is required' }, 400);
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
      return c.json({ error: 'CSV account not found' }, 404);
    }

    const updates: Record<string, string | Date> = {};
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
      return c.json({ error: 'No updates provided' }, 400);
    }

    updates.updatedAt = new Date();

    const [updatedAccount] = await db.update(linkedAccounts)
      .set(updates)
      .where(eq(linkedAccounts.id, accountId))
      .returning();

    return c.json({
      ...updatedAccount,
      csvColumnMapping: updatedAccount.csvColumnMapping
        ? JSON.parse(updatedAccount.csvColumnMapping)
        : null,
    });
  } catch (error) {
    console.error('Failed to update CSV account:', error);
    return c.json({ error: 'Failed to update CSV account' }, 500);
  }
});

// DELETE /accounts - Delete a CSV account
route.delete('/accounts', async (c) => {
  const userId = getUserId(c);

  try {
    const db = await getDb();
    const accountId = c.req.query('id');

    if (!accountId) {
      return c.json({ error: 'Account ID is required' }, 400);
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
      return c.json({ error: 'CSV account not found' }, 404);
    }

    await db.update(linkedAccounts)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(eq(linkedAccounts.id, accountId));

    return c.json({ success: true });
  } catch (error) {
    console.error('Failed to delete CSV account:', error);
    return c.json({ error: 'Failed to delete CSV account' }, 500);
  }
});

// ============================================================================
// PREVIEW
// ============================================================================

// POST /preview - Upload CSV file and get preview with auto-detected mapping
route.post('/preview', async (c) => {
  try {
    const formData = await c.req.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return c.json({ error: 'No file provided' }, 400);
    }

    const csvText = await file.text();

    if (!csvText.trim()) {
      return c.json({ error: 'File is empty' }, 400);
    }

    const { headers, rows } = parseCsvText(csvText);

    if (headers.length === 0) {
      return c.json({ error: 'No columns detected in CSV' }, 400);
    }

    if (rows.length === 0) {
      return c.json({ error: 'No data rows found in CSV' }, 400);
    }

    // Auto-detect column mapping
    const detectedMapping = detectColumnMapping(headers);

    // Try to detect date format from sample data
    if (detectedMapping.dateColumn) {
      const dateSamples = rows.slice(0, 10).map(r => r[detectedMapping.dateColumn!]);
      const dateFormat = detectDateFormat(dateSamples);
      if (dateFormat) {
        detectedMapping.dateFormat = dateFormat;
      }
    }

    const sampleRows = rows.slice(0, 5);

    const response: CsvPreviewResponse = {
      headers,
      sampleRows,
      detectedMapping,
      totalRows: rows.length,
    };

    return c.json(response);
  } catch (error) {
    console.error('CSV preview error:', error);
    return c.json({ error: 'Failed to parse CSV file' }, 500);
  }
});

// ============================================================================
// IMPORT
// ============================================================================

// POST /import - Import CSV transactions into database
route.post('/import', async (c) => {
  const userId = getUserId(c);

  try {
    const db = await getDb();
    const formData = await c.req.formData();
    const file = formData.get('file') as File | null;
    const accountId = formData.get('accountId') as string | null;

    if (!file) {
      return c.json({ error: 'No file provided' }, 400);
    }

    if (!accountId) {
      return c.json({ error: 'Account ID is required' }, 400);
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
      return c.json({ error: 'CSV account not found' }, 404);
    }

    if (!account.csvColumnMapping) {
      return c.json({ error: 'Account has no column mapping configured' }, 400);
    }

    const columnMapping: CsvColumnMapping = JSON.parse(account.csvColumnMapping);

    // Read and parse CSV
    const csvText = await file.text();
    const parseResult = parseCsvWithMapping(csvText, columnMapping);

    if (parseResult.transactions.length === 0 && parseResult.errors.length === 0) {
      return c.json({ error: 'No transactions found in CSV' }, 400);
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
      .set({ lastSyncedAt: new Date(), updatedAt: new Date() })
      .where(eq(linkedAccounts.id, accountId));

    const result: CsvImportResult = {
      imported: newTransactions.length,
      skipped: skippedCount,
      errors: parseResult.errors,
    };

    return c.json(result);
  } catch (error) {
    console.error('CSV import error:', error);
    return c.json({ error: 'Failed to import CSV' }, 500);
  }
});

// PUT /import - Preview import with mapping (parse and show what would be imported)
route.put('/import', async (c) => {
  const userId = getUserId(c);

  try {
    const db = await getDb();
    const formData = await c.req.formData();
    const file = formData.get('file') as File | null;
    const accountId = formData.get('accountId') as string | null;
    const columnMappingJson = formData.get('columnMapping') as string | null;

    if (!file) {
      return c.json({ error: 'No file provided' }, 400);
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
      return c.json({ error: 'No column mapping provided' }, 400);
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

    return c.json({
      transactions: parseResult.transactions.slice(0, 20),
      totalCount: parseResult.transactions.length,
      duplicateCount,
      errors: parseResult.errors,
    });
  } catch (error) {
    console.error('CSV preview error:', error);
    return c.json({ error: 'Failed to preview CSV' }, 500);
  }
});

export default route;
