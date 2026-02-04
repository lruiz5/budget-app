import { NextRequest, NextResponse } from 'next/server';
import {
  getDb,
  getDbStatus,
  resetDbError,
  listBackups,
  createBackup,
  deleteLocalDb,
  restoreFromBackup,
  deleteBackup,
  getCloudDb,
} from '@/db';
import {
  budgets,
  budgetCategories,
  budgetItems,
  transactions,
  splitTransactions,
  linkedAccounts,
  recurringPayments,
  userOnboarding,
} from '@/db/schema';

/**
 * GET /api/database
 * Returns database status and available backups.
 */
export async function GET() {
  const status = getDbStatus();
  const backups = listBackups();

  // Check if cloud database is available
  const hasCloudConnection = !!process.env.DATABASE_URL;

  return NextResponse.json({
    status,
    backups,
    hasCloudConnection,
  });
}

/**
 * POST /api/database
 * Database management operations.
 *
 * Actions:
 * - backup: Create a manual backup of the database
 * - retry: Reset error and retry database initialization
 * - delete: Delete the local database (creates backup first)
 * - restore: Restore from a backup (requires backupPath in body)
 * - deleteBackup: Delete a specific backup (requires backupPath in body)
 * - syncFromCloud: Download all data from cloud database to local
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, backupPath } = body;

    switch (action) {
      case 'backup': {
        const newBackupPath = createBackup();
        if (newBackupPath) {
          return NextResponse.json({
            success: true,
            message: 'Backup created successfully',
            backupPath: newBackupPath,
          });
        } else {
          return NextResponse.json({
            success: false,
            message: 'No database to backup or backup failed',
          }, { status: 400 });
        }
      }

      case 'retry': {
        resetDbError();

        // Try to initialize the database
        try {
          await getDb();
          return NextResponse.json({
            success: true,
            message: 'Database initialized successfully',
          });
        } catch (error) {
          return NextResponse.json({
            success: false,
            message: error instanceof Error ? error.message : 'Failed to initialize database',
          }, { status: 500 });
        }
      }

      case 'delete': {
        const newBackupPath = await deleteLocalDb();
        return NextResponse.json({
          success: true,
          message: 'Database deleted successfully',
          backupPath: newBackupPath,
        });
      }

      case 'restore': {
        if (!backupPath) {
          return NextResponse.json({
            success: false,
            message: 'backupPath is required',
          }, { status: 400 });
        }

        await restoreFromBackup(backupPath);

        // Try to initialize after restore
        try {
          await getDb();
          return NextResponse.json({
            success: true,
            message: 'Database restored successfully',
          });
        } catch (error) {
          return NextResponse.json({
            success: false,
            message: `Database restored but failed to initialize: ${error instanceof Error ? error.message : 'Unknown error'}`,
          }, { status: 500 });
        }
      }

      case 'deleteBackup': {
        if (!backupPath) {
          return NextResponse.json({
            success: false,
            message: 'backupPath is required',
          }, { status: 400 });
        }

        deleteBackup(backupPath);
        return NextResponse.json({
          success: true,
          message: 'Backup deleted successfully',
        });
      }

      case 'syncFromCloud': {
        const cloudDb = getCloudDb();
        if (!cloudDb) {
          return NextResponse.json({
            success: false,
            message: 'Cloud database is not configured. Set DATABASE_URL in your environment.',
          }, { status: 400 });
        }

        // Delete local database first
        await deleteLocalDb();

        // Initialize fresh local database
        const localDb = await getDb();

        // Sync tables in FK dependency order
        try {
          // 1. Budgets
          const cloudBudgets = await cloudDb.select().from(budgets);
          if (cloudBudgets.length > 0) {
            await localDb.insert(budgets).values(cloudBudgets);
          }

          // 2. Budget Categories
          const cloudCategories = await cloudDb.select().from(budgetCategories);
          if (cloudCategories.length > 0) {
            await localDb.insert(budgetCategories).values(cloudCategories);
          }

          // 3. Linked Accounts
          const cloudAccounts = await cloudDb.select().from(linkedAccounts);
          if (cloudAccounts.length > 0) {
            await localDb.insert(linkedAccounts).values(cloudAccounts);
          }

          // 4. Recurring Payments
          const cloudRecurring = await cloudDb.select().from(recurringPayments);
          if (cloudRecurring.length > 0) {
            await localDb.insert(recurringPayments).values(cloudRecurring);
          }

          // 5. Budget Items
          const cloudItems = await cloudDb.select().from(budgetItems);
          if (cloudItems.length > 0) {
            await localDb.insert(budgetItems).values(cloudItems);
          }

          // 6. Transactions
          const cloudTransactions = await cloudDb.select().from(transactions);
          if (cloudTransactions.length > 0) {
            await localDb.insert(transactions).values(cloudTransactions);
          }

          // 7. Split Transactions
          const cloudSplits = await cloudDb.select().from(splitTransactions);
          if (cloudSplits.length > 0) {
            await localDb.insert(splitTransactions).values(cloudSplits);
          }

          // 8. User Onboarding
          const cloudOnboarding = await cloudDb.select().from(userOnboarding);
          if (cloudOnboarding.length > 0) {
            await localDb.insert(userOnboarding).values(cloudOnboarding);
          }

          const totalRecords =
            cloudBudgets.length +
            cloudCategories.length +
            cloudAccounts.length +
            cloudRecurring.length +
            cloudItems.length +
            cloudTransactions.length +
            cloudSplits.length +
            cloudOnboarding.length;

          return NextResponse.json({
            success: true,
            message: `Synced ${totalRecords} records from cloud`,
            counts: {
              budgets: cloudBudgets.length,
              categories: cloudCategories.length,
              accounts: cloudAccounts.length,
              recurringPayments: cloudRecurring.length,
              items: cloudItems.length,
              transactions: cloudTransactions.length,
              splitTransactions: cloudSplits.length,
              onboarding: cloudOnboarding.length,
            },
          });
        } catch (syncError) {
          return NextResponse.json({
            success: false,
            message: `Sync failed: ${syncError instanceof Error ? syncError.message : 'Unknown error'}`,
          }, { status: 500 });
        }
      }

      default:
        return NextResponse.json({
          success: false,
          message: `Unknown action: ${action}`,
        }, { status: 400 });
    }
  } catch (error) {
    return NextResponse.json({
      success: false,
      message: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 500 });
  }
}
