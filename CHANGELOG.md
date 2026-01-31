# Changelog

All notable changes to this project will be documented in this file.

## [1.5.0] - 2026-01-30 - Interactive Insights Charts

### Added
- **D3.js charts** on Insights page — three interactive visualizations powered by D3.js and d3-sankey
- **Budget vs Actual** — horizontal grouped bar chart comparing planned vs actual spending per category, with over-budget highlighting in red
- **Spending Trends** — multi-line chart tracking spending by category over the last 3 months, with clickable legend to toggle category visibility
- **Cash Flow (Sankey)** — 3-column flow diagram: Sources (Buffer, Income) → Categories → Individual Budget Items, with gradient-colored flows and detailed hover tooltips
- **Chart infrastructure** — shared tooltip component, empty state component, category color mapping, and data transformation utilities
- **Multi-month data fetching** — insights page loads current + 2 previous months for trend analysis

### Changed
- Insights page max width increased from `max-w-4xl` to `max-w-6xl`
- Replaced "Coming Soon" placeholder cards with live interactive charts
- Added refresh button with loading spinner to insights page

## [1.4.0] - 2026-01-29 - Supabase Migration & Mobile Prep

### Added
- **Supabase PostgreSQL** — migrated from SQLite to Supabase for multi-device sync
- **Capacitor** — live server mode for future iOS/Android builds
- **Previous month transactions** — sidebar "New" tab shows last 3 days of previous month with month headings
- **Data migration script** (`scripts/migrate-data.ts`) — migrates all 7 tables with FK ordering and sequence resets

### Changed
- **Database driver:** `better-sqlite3` → `postgres` via `drizzle-orm/postgres-js`
- **Schema:** All tables converted from `sqliteTable` to `pgTable` with PostgreSQL types
- **Teller sync optimized** — batch queries replace N+1 pattern (~60s → fast)
- **Numeric handling:** All `numeric` column reads wrapped with `parseFloat(String())` across 10+ files

### Fixed
- **Monthly Report** — Saving category no longer counted as expense in totals
- **Split transaction edit** — `.toFixed()` error fixed for PostgreSQL numeric strings
- **Claim data endpoint** — `.changes` replaced with `.returning().length` for PostgreSQL

### Architecture Decision
- **Phase 5 (Edge Functions) skipped** — Next.js API routes connect directly to Supabase PostgreSQL via Drizzle ORM. No functional benefit to migrating to Deno-based Edge Functions. See CLAUDE.md for full rationale.

## [1.3.1] - 2026-01-29 - Build Fix

### Fixed
- **Production build failure** — wrapped `useSearchParams()` in Suspense boundary on `/recurring` page (required by Next.js for static prerendering)

## [1.3.0] - 2026-01-29 - Onboarding & Empty States (Final SQLite Release)

### Added
- **Interactive onboarding** — 6-step guided setup for new users at `/onboarding`
  - Welcome → Concepts → Set Buffer → Create Budget Items → Add Transaction → Complete
  - Suggested budget items as clickable pill badges (Rent $1,200, Groceries $400, etc.)
  - Suggested transactions as quick-fill badges based on items created during onboarding
  - Progress persisted in database — users can resume if interrupted
  - Skip option for experienced users
- **"Getting Started" sidebar link** — revisit onboarding anytime (FaLightbulb icon)
- **Onboarding API** (`/api/onboarding`) — GET, POST, PUT, PATCH for status tracking
- **`user_onboarding` database table** — tracks currentStep, completedAt, skippedAt per user
- **Migration script** (`scripts/migrate-add-onboarding.ts`) for existing users
- **Monthly report empty states** — friendly messages for new users with no spending data
  - Top Spending Items: empty state message instead of empty table
  - Potential Reallocation: hidden when no spending recorded
  - Category Breakdown: "No spending recorded yet" note
  - Buffer Flow: contextual help text for new vs active users
- `.env.example` file for easier setup

### Changed
- Sign-up now redirects to `/onboarding` instead of `/`
- Main page (`/`) checks onboarding status and redirects if incomplete

## [1.2.0] - 2026-01-28 - Auth Page Theming & UI Polish

### Added
- **Currency formatting** — `lib/formatCurrency.ts` utility for consistent `$x,xxx.xx` display
- **Total Savings rows** in Budget Summary sidebar (Planned and Actual sections)
- **Animated auth background** — diagonal scrolling "BUDGET APP" text on sign-in/sign-up pages
- **Clerk component theming** — Emerald design system applied to auth forms

### Changed
- Progress bar color changed from `bg-primary-light` to `bg-success` (green) with glow shadows
- Over-budget items use `bg-danger` with matching glow

### Fixed
- Split transaction ownership verification (parent has null `budgetItemId` after splitting)

## [1.1.0] - 2026-01-27 - UI Overhaul & Design System

### Added
- **Outfit font** via `next/font/google`
- **Emerald design system** — semantic CSS color tokens in `globals.css` mapped to Tailwind
- **`DESIGN_SYSTEM.md`** — comprehensive design token documentation

### Changed
- Unified all icons to `react-icons/fa`
- Global `cursor: pointer` on interactive elements
- Summary/Transactions tab icons wrapped in circles with badge positioning

## [1.0.0] - 2026-01-26 - User Authentication

### Added
- **Clerk authentication** — sign-in, sign-up, route protection
- **Multi-user support** — `userId` columns on budgets, linked_accounts, recurring_payments
- **UserButton** in sidebar footer for account management
- **Data claiming** — `/api/auth/claim-data` endpoint for migrating existing data
- `middleware.ts` for Clerk route protection
- `lib/auth.ts` — `requireAuth()` and `isAuthError()` helpers

### Changed
- All 11 API route files updated with auth checks and userId scoping

## [0.9.0] - Split Transaction Editing

### Added
- **Edit existing splits** by clicking any split transaction
- Editable from Item Detail View, Tracked Transactions tab, and BudgetSection dropdown
- `ExistingSplit` interface in SplitTransactionModal

## [0.8.0] - Recurring Payments & Budget Item Detail

### Added
- **Recurring payments** — full CRUD at `/recurring` with multiple frequencies
- **Budget item detail view** — click any item to see details in sidebar
- **Buffer Flow** in Monthly Report (Insights > Monthly Summary)
- "Make this recurring" button in item detail view
- Auto-sync recurring payments to budget items in new months
