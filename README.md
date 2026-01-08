# Budget App

A modern budget tracking application built with Next.js, TypeScript, and Tailwind CSS.

## Project Status

**Current Version:** v0.4.0 - Starting Balance (Buffer) Feature
**Last Updated:** 2026-01-07

### Tech Stack
- Next.js 16.x (App Router)
- TypeScript
- Tailwind CSS
- ESLint
- Drizzle ORM
- SQLite (better-sqlite3)
- React Hooks (useState, useEffect)

### Features
- **Zero-Based Budgeting System** - Every dollar of income is assigned to a category
- **Starting Balance (Buffer)** - Track money carried over from previous month (separate from income)
- **Month/Year Navigation** - Navigate between different budget periods
- **Budget Categories**:
  - Income (separate tracking)
  - Giving
  - Household
  - Transportation
  - Food
  - Personal
  - Insurance
  - Saving
- **Budget Item Management**:
  - Add/remove items within each category
  - Set planned amounts for each budget item
  - Actual amounts calculated automatically from transactions
  - View difference between planned and actual
- **Transaction Tracking**:
  - Add individual transactions to budget items (click the "+$" button)
  - Each transaction includes date, description, and amount
  - Actual spending automatically calculated from all transactions
  - Expandable transaction list for each budget item (click ▶ arrow)
  - Delete individual transactions
  - Transaction count badge shows number of transactions per item
- **Real-time Budget Summary**:
  - Buffer + Income vs Total Expenses
  - Remaining amount to budget
  - Budget balance status indicator
  - Separate planned and actual tracking
- **Responsive Design** - Works on desktop and mobile devices
- **Data Persistence** - All budget data stored in local SQLite database
- **Multi-Month Support** - Create and manage budgets for different months/years

### Database
The app uses SQLite for local data storage with Drizzle ORM for type-safe database operations.

**Database Commands:**
- `npm run db:push` - Push schema changes to database
- `npm run db:studio` - Open Drizzle Studio to view/edit data
- `npm run db:generate` - Generate migration files
- `npm run db:migrate` - Run migrations

**Database Schema:**
- **budgets** - Monthly budget containers
- **budget_categories** - Categories within each budget (Income, Giving, etc.)
- **budget_items** - Individual line items (e.g., "Gas", "Groceries")
- **transactions** - Individual transactions for each budget item

### How to Use
1. **Set starting balance**: Enter the buffer amount (money carried over from previous month) at the top
2. **Set up your budget**: Add budget items to each category and set planned amounts
3. **Add transactions**: Click the "+$" button next to any budget item to record a transaction
4. **Track spending**: The actual amount updates automatically as you add transactions
5. **View details**: Click the arrow (▶) next to items with transactions to see the full list
6. **Stay balanced**: Keep your budget balanced by ensuring Buffer + Income = Total Expenses

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
