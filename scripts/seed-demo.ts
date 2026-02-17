/**
 * Demo User Seed Script
 *
 * Creates realistic budget data for a demo Clerk user — 3 months of budgets,
 * transactions, recurring payments, and a split transaction.
 *
 * Usage:
 *   1. Create a demo user in Clerk dashboard, note the userId
 *   2. Set DEMO_USER_ID below (or pass as env var)
 *   3. Run: npx tsx scripts/seed-demo.ts
 *
 * Safe to re-run — deletes all existing demo user data first.
 */

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "../db/schema";
import { eq } from "drizzle-orm";

const {
  budgets,
  budgetCategories,
  budgetItems,
  transactions,
  splitTransactions,
  recurringPayments,
  userOnboarding,
  linkedAccounts,
} = schema;

// Create DB connection — DATABASE_URL must be set via CLI (--env-file or export)
const client = postgres(process.env.DATABASE_URL!, { prepare: false });
const db = drizzle(client, { schema });

const DEMO_USER_ID =
  process.env.DEMO_USER_ID || "user_39o88GxqvuAsvdaq089W8C1IMxO";

// ─── Default Categories ──────────────────────────────────────────────

const DEFAULT_CATEGORIES = [
  { categoryType: "income", name: "Income", emoji: null, categoryOrder: 0 },
  { categoryType: "giving", name: "Giving", emoji: null, categoryOrder: 1 },
  {
    categoryType: "household",
    name: "Household",
    emoji: null,
    categoryOrder: 2,
  },
  {
    categoryType: "transportation",
    name: "Transportation",
    emoji: null,
    categoryOrder: 3,
  },
  { categoryType: "food", name: "Food", emoji: null, categoryOrder: 4 },
  { categoryType: "personal", name: "Personal", emoji: null, categoryOrder: 5 },
  {
    categoryType: "insurance",
    name: "Insurance",
    emoji: null,
    categoryOrder: 6,
  },
  { categoryType: "saving", name: "Saving", emoji: null, categoryOrder: 7 },
];

const CUSTOM_CATEGORIES = [
  {
    categoryType: "entertainment",
    name: "Entertainment",
    emoji: "🎬",
    categoryOrder: 8,
  },
];

// ─── Budget Items by Category ────────────────────────────────────────

interface ItemDef {
  name: string;
  planned: string;
}

const ITEMS_BY_CATEGORY: Record<string, ItemDef[]> = {
  income: [
    { name: "Paycheck", planned: "5200.00" },
    { name: "Side Income", planned: "400.00" },
  ],
  giving: [
    { name: "Tithe", planned: "520.00" },
    { name: "Charity", planned: "40.00" },
  ],
  household: [
    { name: "Rent", planned: "1800.00" },
    { name: "Utilities", planned: "200.00" },
    { name: "Internet", planned: "50.00" },
  ],
  transportation: [
    { name: "Gas", planned: "150.00" },
    { name: "Car Maintenance", planned: "100.00" },
  ],
  food: [
    { name: "Groceries", planned: "500.00" },
    { name: "Dining Out", planned: "150.00" },
    { name: "Coffee", planned: "50.00" },
  ],
  personal: [
    { name: "Clothing", planned: "100.00" },
    { name: "Subscriptions", planned: "50.00" },
    { name: "Haircut", planned: "30.00" },
  ],
  insurance: [
    { name: "Health Insurance", planned: "250.00" },
    { name: "Car Insurance", planned: "125.00" },
  ],
  saving: [
    { name: "Emergency Fund", planned: "300.00" },
    { name: "Vacation", planned: "250.00" },
  ],
  entertainment: [
    { name: "Movies", planned: "40.00" },
    { name: "Games", planned: "30.00" },
  ],
};

// ─── Transaction Templates ──────────────────────────────────────────

interface TxDef {
  itemName: string;
  categoryType: string;
  description: string;
  amount: string;
  type: "income" | "expense";
  merchant: string | null;
  dayOffset: number; // day of month
}

// February 2026 transactions
const FEB_TRANSACTIONS: TxDef[] = [
  // Income
  {
    itemName: "Paycheck",
    categoryType: "income",
    description: "Bi-weekly paycheck",
    amount: "2600.00",
    type: "income",
    merchant: "Employer Direct Deposit",
    dayOffset: 1,
  },
  {
    itemName: "Paycheck",
    categoryType: "income",
    description: "Bi-weekly paycheck",
    amount: "2600.00",
    type: "income",
    merchant: "Employer Direct Deposit",
    dayOffset: 25,
  },
  {
    itemName: "Side Income",
    categoryType: "income",
    description: "Freelance Design",
    amount: "400.00",
    type: "income",
    merchant: "Freelance Client",
    dayOffset: 8,
  },
  // Giving
  {
    itemName: "Tithe",
    categoryType: "giving",
    description: "Monthly tithe",
    amount: "520.00",
    type: "expense",
    merchant: null,
    dayOffset: 2,
  },
  {
    itemName: "Charity",
    categoryType: "giving",
    description: "Red Cross donation",
    amount: "40.00",
    type: "expense",
    merchant: "Red Cross",
    dayOffset: 10,
  },
  // Household
  {
    itemName: "Rent",
    categoryType: "household",
    description: "Monthly rent",
    amount: "1800.00",
    type: "expense",
    merchant: "Property Management",
    dayOffset: 1,
  },
  {
    itemName: "Utilities",
    categoryType: "household",
    description: "Electric bill",
    amount: "120.00",
    type: "expense",
    merchant: "Electric Co",
    dayOffset: 5,
  },
  {
    itemName: "Utilities",
    categoryType: "household",
    description: "Water bill",
    amount: "45.00",
    type: "expense",
    merchant: "City Water",
    dayOffset: 7,
  },
  {
    itemName: "Internet",
    categoryType: "household",
    description: "Internet service",
    amount: "50.00",
    type: "expense",
    merchant: "Comcast",
    dayOffset: 3,
  },
  // Transportation
  {
    itemName: "Gas",
    categoryType: "transportation",
    description: "Gas fill-up",
    amount: "42.00",
    type: "expense",
    merchant: "Shell",
    dayOffset: 3,
  },
  {
    itemName: "Gas",
    categoryType: "transportation",
    description: "Gas fill-up",
    amount: "38.00",
    type: "expense",
    merchant: "Chevron",
    dayOffset: 9,
  },
  {
    itemName: "Gas",
    categoryType: "transportation",
    description: "Gas fill-up",
    amount: "45.00",
    type: "expense",
    merchant: "BP",
    dayOffset: 13,
  },
  {
    itemName: "Car Payment",
    categoryType: "transportation",
    description: "Auto loan payment",
    amount: "350.00",
    type: "expense",
    merchant: "Auto Finance",
    dayOffset: 1,
  },
  // Food
  {
    itemName: "Groceries",
    categoryType: "food",
    description: "Weekly groceries",
    amount: "135.00",
    type: "expense",
    merchant: "Whole Foods",
    dayOffset: 2,
  },
  {
    itemName: "Groceries",
    categoryType: "food",
    description: "Weekly groceries",
    amount: "98.00",
    type: "expense",
    merchant: "Trader Joes",
    dayOffset: 6,
  },
  {
    itemName: "Groceries",
    categoryType: "food",
    description: "Weekly groceries",
    amount: "142.00",
    type: "expense",
    merchant: "Kroger",
    dayOffset: 10,
  },
  {
    itemName: "Groceries",
    categoryType: "food",
    description: "Weekly groceries",
    amount: "87.00",
    type: "expense",
    merchant: "Aldi",
    dayOffset: 14,
  },
  {
    itemName: "Dining Out",
    categoryType: "food",
    description: "Dinner out",
    amount: "32.00",
    type: "expense",
    merchant: "Chipotle",
    dayOffset: 4,
  },
  {
    itemName: "Dining Out",
    categoryType: "food",
    description: "Date night",
    amount: "55.00",
    type: "expense",
    merchant: "Olive Garden",
    dayOffset: 8,
  },
  {
    itemName: "Dining Out",
    categoryType: "food",
    description: "Lunch",
    amount: "28.00",
    type: "expense",
    merchant: "Panera Bread",
    dayOffset: 12,
  },
  {
    itemName: "Coffee",
    categoryType: "food",
    description: "Morning coffee",
    amount: "6.50",
    type: "expense",
    merchant: "Starbucks",
    dayOffset: 3,
  },
  {
    itemName: "Coffee",
    categoryType: "food",
    description: "Morning coffee",
    amount: "6.50",
    type: "expense",
    merchant: "Starbucks",
    dayOffset: 7,
  },
  {
    itemName: "Coffee",
    categoryType: "food",
    description: "Morning coffee",
    amount: "6.50",
    type: "expense",
    merchant: "Starbucks",
    dayOffset: 10,
  },
  {
    itemName: "Coffee",
    categoryType: "food",
    description: "Morning coffee",
    amount: "6.50",
    type: "expense",
    merchant: "Starbucks",
    dayOffset: 14,
  },
  // Personal
  {
    itemName: "Clothing",
    categoryType: "personal",
    description: "New shirt",
    amount: "78.00",
    type: "expense",
    merchant: "Target",
    dayOffset: 9,
  },
  {
    itemName: "Subscriptions",
    categoryType: "personal",
    description: "Netflix",
    amount: "15.99",
    type: "expense",
    merchant: "Netflix",
    dayOffset: 1,
  },
  {
    itemName: "Subscriptions",
    categoryType: "personal",
    description: "Spotify",
    amount: "10.99",
    type: "expense",
    merchant: "Spotify",
    dayOffset: 1,
  },
  {
    itemName: "Haircut",
    categoryType: "personal",
    description: "Haircut",
    amount: "30.00",
    type: "expense",
    merchant: "Great Clips",
    dayOffset: 11,
  },
  // Insurance
  {
    itemName: "Health Insurance",
    categoryType: "insurance",
    description: "Health insurance premium",
    amount: "250.00",
    type: "expense",
    merchant: "Blue Cross",
    dayOffset: 1,
  },
  {
    itemName: "Car Insurance",
    categoryType: "insurance",
    description: "Auto insurance",
    amount: "125.00",
    type: "expense",
    merchant: "State Farm",
    dayOffset: 1,
  },
  // Saving
  {
    itemName: "Emergency Fund",
    categoryType: "saving",
    description: "Emergency fund contribution",
    amount: "300.00",
    type: "expense",
    merchant: null,
    dayOffset: 1,
  },
  {
    itemName: "Vacation",
    categoryType: "saving",
    description: "Vacation savings",
    amount: "200.00",
    type: "expense",
    merchant: null,
    dayOffset: 1,
  },
  // Entertainment
  {
    itemName: "Movies",
    categoryType: "entertainment",
    description: "Movie night",
    amount: "24.00",
    type: "expense",
    merchant: "AMC Theatres",
    dayOffset: 7,
  },
  {
    itemName: "Games",
    categoryType: "entertainment",
    description: "Video game",
    amount: "29.99",
    type: "expense",
    merchant: "Steam",
    dayOffset: 5,
  },
];

// ─── Uncategorized Transactions (Feb only) ──────────────────────────
// These have no budgetItemId so the user can demo categorization, auto-categorize, and split

interface UncategorizedTxDef {
  description: string;
  amount: string;
  type: "income" | "expense";
  merchant: string;
  dayOffset: number;
}

const UNCATEGORIZED_TRANSACTIONS: UncategorizedTxDef[] = [
  {
    description: "POS DEBIT - Costco Wholesale",
    amount: "87.43",
    type: "expense",
    merchant: "Costco",
    dayOffset: 11,
  },
  {
    description: "Amazon.com order",
    amount: "34.99",
    type: "expense",
    merchant: "Amazon",
    dayOffset: 13,
  },
  {
    description: "Walgreens pharmacy",
    amount: "12.50",
    type: "expense",
    merchant: "Walgreens",
    dayOffset: 14,
  },
  {
    description: "Home Depot - plumbing supplies",
    amount: "65.00",
    type: "expense",
    merchant: "Home Depot",
    dayOffset: 15,
  },
  {
    description: "Venmo payment received",
    amount: "50.00",
    type: "income",
    merchant: "Venmo",
    dayOffset: 12,
  },
];

// ─── Helpers ─────────────────────────────────────────────────────────

function dateStr(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** Vary an amount by +/- percentage for historical months */
function vary(amount: string, pct: number = 0.15): string {
  const val = parseFloat(amount);
  const delta = val * pct * (Math.random() * 2 - 1);
  return Math.max(0.01, val + delta).toFixed(2);
}

// ─── Main Seed Function ─────────────────────────────────────────────

async function seed() {
  console.log(`🌱 Seeding demo data for user: ${DEMO_USER_ID}`);

  // 1. Clean up existing demo data
  console.log("🗑️  Cleaning existing demo data...");
  const existingBudgets = await db
    .select({ id: budgets.id })
    .from(budgets)
    .where(eq(budgets.userId, DEMO_USER_ID));
  // Transactions, items, categories cascade from budget deletion
  for (const b of existingBudgets) {
    await db.delete(budgets).where(eq(budgets.id, b.id));
  }
  await db
    .delete(recurringPayments)
    .where(eq(recurringPayments.userId, DEMO_USER_ID));
  await db
    .delete(userOnboarding)
    .where(eq(userOnboarding.userId, DEMO_USER_ID));
  // Delete transactions linked to this user's accounts before deleting the accounts
  // (uncategorized transactions have budgetItemId=null so they don't cascade with budget deletion)
  const existingAccounts = await db
    .select({ id: linkedAccounts.id })
    .from(linkedAccounts)
    .where(eq(linkedAccounts.userId, DEMO_USER_ID));
  for (const acct of existingAccounts) {
    await db.delete(transactions).where(eq(transactions.linkedAccountId, acct.id));
  }
  await db
    .delete(linkedAccounts)
    .where(eq(linkedAccounts.userId, DEMO_USER_ID));

  // Mark onboarding as complete
  await db.insert(userOnboarding).values({
    userId: DEMO_USER_ID,
    currentStep: 7,
    completedAt: new Date(),
  });

  // 2. Create 3 months of budgets
  const monthConfigs = [
    { month: 11, year: 2025, label: "Dec 2025", buffer: "100.00" },
    { month: 0, year: 2026, label: "Jan 2026", buffer: "200.00" },
    { month: 1, year: 2026, label: "Feb 2026", buffer: "160.00" },
  ];

  // Track item IDs for Feb (we'll use them for split + recurring linking)
  const febItemIds: Record<string, number> = {};

  for (const mc of monthConfigs) {
    console.log(`📅 Creating ${mc.label}...`);
    const isCurrent = mc.month === 1 && mc.year === 2026;

    // Insert budget
    const [budget] = await db
      .insert(budgets)
      .values({
        userId: DEMO_USER_ID,
        month: mc.month,
        year: mc.year,
        buffer: mc.buffer,
      })
      .returning();

    // Insert categories
    const allCats = [...DEFAULT_CATEGORIES, ...CUSTOM_CATEGORIES];
    for (const cat of allCats) {
      const [category] = await db
        .insert(budgetCategories)
        .values({
          budgetId: budget.id,
          categoryType: cat.categoryType,
          name: cat.name,
          emoji: cat.emoji,
          categoryOrder: cat.categoryOrder,
        })
        .returning();

      // Insert items for this category
      const items = ITEMS_BY_CATEGORY[cat.categoryType] || [];
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        const planned = isCurrent ? item.planned : vary(item.planned, 0.05);

        const [budgetItem] = await db
          .insert(budgetItems)
          .values({
            categoryId: category.id,
            name: item.name,
            planned,
            order: i,
          })
          .returning();

        // Track Feb item IDs
        if (isCurrent) {
          febItemIds[`${cat.categoryType}:${item.name}`] = budgetItem.id;
        }

        // Insert transactions
        const txsForItem = FEB_TRANSACTIONS.filter(
          (tx) =>
            tx.categoryType === cat.categoryType && tx.itemName === item.name,
        );

        for (const tx of txsForItem) {
          // Determine the actual month/year for the date
          const actualMonth =
            mc.month === 0 ? 1 : mc.month === 11 ? 12 : mc.month + 1;
          const actualYear = mc.month === 11 ? 2025 : mc.year;
          const day = Math.min(tx.dayOffset, 28); // safe for all months

          await db.insert(transactions).values({
            budgetItemId: budgetItem.id,
            date: dateStr(actualYear, actualMonth, day),
            description: tx.description,
            amount: isCurrent ? tx.amount : vary(tx.amount, 0.1),
            type: tx.type,
            merchant: tx.merchant,
          });
        }
      }
    }
  }

  // 3. Create split transaction (Feb: Target purchase split between Groceries and Utilities)
  console.log("✂️  Creating split transaction...");
  const groceriesId = febItemIds["food:Groceries"];
  const utilitiesId = febItemIds["household:Utilities"];

  if (groceriesId && utilitiesId) {
    // Insert parent transaction with null budgetItemId (split parent)
    const [splitParent] = await db
      .insert(transactions)
      .values({
        budgetItemId: null,
        date: "2026-02-02",
        description: "Target run - groceries & household",
        amount: "135.00",
        type: "expense",
        merchant: "Target",
      })
      .returning();

    // Insert splits
    await db.insert(splitTransactions).values([
      {
        parentTransactionId: splitParent.id,
        budgetItemId: groceriesId,
        amount: "98.00",
        description: "Groceries",
      },
      {
        parentTransactionId: splitParent.id,
        budgetItemId: utilitiesId,
        amount: "37.00",
        description: "Household supplies",
      },
    ]);
  }

  // 4. Create recurring payments
  console.log("🔄 Creating recurring payments...");
  const recurringDefs = [
    {
      name: "Netflix",
      amount: "15.99",
      frequency: "monthly" as const,
      nextDueDate: "2026-03-01",
      categoryType: "personal" as const,
      fundedAmount: "15.99",
    },
    {
      name: "Spotify",
      amount: "10.99",
      frequency: "monthly" as const,
      nextDueDate: "2026-03-01",
      categoryType: "personal" as const,
      fundedAmount: "10.99",
    },
    {
      name: "Car Insurance",
      amount: "750.00",
      frequency: "semi-annually" as const,
      nextDueDate: "2026-06-01",
      categoryType: "insurance" as const,
      fundedAmount: "375.00",
    },
    {
      name: "Rent",
      amount: "1800.00",
      frequency: "monthly" as const,
      nextDueDate: "2026-03-01",
      categoryType: "household" as const,
      fundedAmount: "0",
    },
  ];

  for (const rp of recurringDefs) {
    await db.insert(recurringPayments).values({
      userId: DEMO_USER_ID,
      name: rp.name,
      amount: rp.amount,
      frequency: rp.frequency,
      nextDueDate: rp.nextDueDate,
      categoryType: rp.categoryType,
      fundedAmount: rp.fundedAmount,
    });
  }

  // 5. Create fake linked account (for demo appearance — no actual Teller sync)
  console.log("🏦 Creating fake linked account...");
  const [chaseAccount] = await db
    .insert(linkedAccounts)
    .values({
      userId: DEMO_USER_ID,
      tellerAccountId: "acc_demo_checking_001",
      tellerEnrollmentId: "enr_demo_001",
      accessToken: "demo-token-not-real",
      institutionName: "Chase",
      institutionId: "chase",
      accountName: "Chase Total Checking",
      accountType: "depository",
      accountSubtype: "checking",
      lastFour: "1234",
      status: "open",
      syncEnabled: true,
      syncStartDate: "2026-01-01",
      lastSyncedAt: new Date(),
    })
    .returning();

  // 6. Create non-earned income transaction (Feb only — demos isNonEarned toggle)
  console.log("🎁 Creating non-earned income transaction...");
  const sideIncomeId = febItemIds["income:Side Income"];
  if (sideIncomeId) {
    await db.insert(transactions).values({
      budgetItemId: sideIncomeId,
      date: "2026-02-14",
      description: "Birthday gift from Mom",
      amount: "100.00",
      type: "income",
      merchant: null,
      isNonEarned: true,
    });
  }

  // 7. Create uncategorized transactions linked to Chase (Feb only — for demo of categorization)
  console.log("❓ Creating uncategorized transactions...");
  for (const tx of UNCATEGORIZED_TRANSACTIONS) {
    await db.insert(transactions).values({
      budgetItemId: null,
      linkedAccountId: chaseAccount.id,
      date: dateStr(2026, 2, tx.dayOffset),
      description: tx.description,
      amount: tx.amount,
      type: tx.type,
      merchant: tx.merchant,
    });
  }

  // 8. Create pending transactions (Feb only — shows pending badge)
  console.log("⏳ Creating pending transactions...");
  const diningOutId = febItemIds["food:Dining Out"];
  const gasId = febItemIds["transportation:Gas"];
  if (diningOutId) {
    await db.insert(transactions).values({
      budgetItemId: diningOutId,
      linkedAccountId: chaseAccount.id,
      date: "2026-02-16",
      description: "Chick-fil-A",
      amount: "11.50",
      type: "expense",
      merchant: "Chick-fil-A",
      status: "pending",
    });
  }
  if (gasId) {
    await db.insert(transactions).values({
      budgetItemId: gasId,
      linkedAccountId: chaseAccount.id,
      date: "2026-02-16",
      description: "Uber trip",
      amount: "18.75",
      type: "expense",
      merchant: "Uber",
      status: "pending",
    });
  }

  // Summary
  const txCount =
    FEB_TRANSACTIONS.length * 3 + 1 + UNCATEGORIZED_TRANSACTIONS.length + 3; // 3 months + 1 split parent + uncategorized + 1 gift + 2 pending
  console.log(`\n✅ Demo data seeded successfully!`);
  console.log(`   📊 3 budgets (Dec 2025, Jan 2026, Feb 2026)`);
  console.log(`   📝 ~${txCount} transactions`);
  console.log(`   ✂️  1 split transaction`);
  console.log(
    `   ❓ ${UNCATEGORIZED_TRANSACTIONS.length} uncategorized transactions`,
  );
  console.log(`   🎁 1 non-earned income (gift)`);
  console.log(`   ⏳ 2 pending transactions`);
  console.log(`   🔄 4 recurring payments`);
  console.log(`   🏦 1 linked account (Chase)`);
  console.log(`\n   Sign in with the demo user to see the data.`);

  process.exit(0);
}

seed().catch((err) => {
  console.error("❌ Seed failed:", err);
  process.exit(1);
});
