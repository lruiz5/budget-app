# Budget App: Supabase Migration Plan (Completed)

## Overview
This document tracks the migration from SQLite to Supabase (PostgreSQL) for multi-device sync. The migration was completed in v1.4.0.

**Final Architecture:**
- Web App → Next.js API Routes (Vercel) → Supabase PostgreSQL
- iOS App → Next.js API Routes (Vercel) → Supabase PostgreSQL
- Teller bank sync: server-side only (via Next.js API routes)

---

## Phase 1: Supabase Project Setup (Completed)

### Tasks
1. Create Supabase project at supabase.com
2. Note credentials: project URL, anon key, service role key, database URL
3. Create `.env.local` with:
   ```
   NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=xxx
   DATABASE_URL=postgresql://postgres:xxx@db.xxx.supabase.co:5432/postgres
   SUPABASE_SERVICE_ROLE_KEY=xxx
   ```

### Verification
- Can access Supabase dashboard and SQL editor

---

## Phase 2: Update Dependencies (Completed)

### Files to modify
- `package.json`

### Changes
**Add:**
- `@supabase/supabase-js` - Supabase client
- `postgres` - PostgreSQL driver for Drizzle

**Remove:**
- `better-sqlite3`
- `@types/better-sqlite3`

### Commands
```bash
npm install @supabase/supabase-js postgres
npm uninstall better-sqlite3 @types/better-sqlite3
```

---

## Phase 3: Convert Database Layer to PostgreSQL (Completed)

### Files to modify
1. `drizzle.config.ts` - Change dialect to `postgresql`
2. `db/index.ts` - Switch to `postgres` driver
3. `db/schema.ts` - Convert all types to PostgreSQL

### Schema Type Conversions
| SQLite | PostgreSQL |
|--------|------------|
| `sqliteTable` | `pgTable` |
| `integer().primaryKey({ autoIncrement: true })` | `serial().primaryKey()` |
| `integer({ mode: 'timestamp' })` | `timestamp({ withTimezone: true })` |
| `integer({ mode: 'boolean' })` | `boolean()` |
| `real()` for money | `numeric({ precision: 10, scale: 2 })` |

### Key Changes in db/index.ts
```typescript
// FROM:
import { drizzle } from 'drizzle-orm/better-sqlite3';
import Database from 'better-sqlite3';
const sqlite = new Database('budget.db');
export const db = drizzle(sqlite, { schema });

// TO:
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
const client = postgres(process.env.DATABASE_URL!, { prepare: false });
export const db = drizzle(client, { schema });
```

### Verification
```bash
npm run db:push  # Push schema to Supabase
# Check Supabase dashboard → Table Editor
```

---

## Phase 4: Migrate Existing Data (Completed)

### Create migration script
- `scripts/migrate-data.ts` (new file)

### Migration order (respects foreign keys)
1. budgets
2. budget_categories
3. linked_accounts
4. recurring_payments
5. budget_items
6. transactions
7. split_transactions

### Data transformations
- Unix timestamps → ISO strings
- Integer booleans (0/1) → true/false
- Reset PostgreSQL sequences after insert

### Verification
- Run migration script
- Navigate through app, verify all data appears
- Keep `budget.db` as backup until verified

---

## Phase 5: Edge Functions (Skipped)

**Decision:** Phase 5 (migrating API routes to Supabase Edge Functions) was intentionally skipped.

**Rationale:**
- Next.js API routes already work with PostgreSQL — no functional reason to migrate
- Edge Functions use Deno runtime, requiring significant code rewriting
- Teller API integration (certificates, mTLS) would need special handling in Deno
- Current architecture works for both web and mobile
- Skipping avoids introducing complexity with no user-facing benefit

---

## Mobile App (Native iOS — v1.9.0)

Instead of using Capacitor to wrap the web app, a native iOS app was built with SwiftUI.

**See:** `ios/BudgetApp/` directory for the complete native iOS implementation.

**iOS App Details:**
- SwiftUI targeting iOS 17+
- MVVM architecture
- Clerk iOS SDK for authentication
- URLSession + async/await for networking
- Tab-based navigation: Budget, Transactions, Accounts, Insights

---

## Final Migration Status

| Phase | Status | Notes |
|-------|--------|-------|
| Phase 1: Supabase Setup | ✅ Done | Project created, credentials configured |
| Phase 2: Dependencies | ✅ Done | `postgres` added, `better-sqlite3` removed |
| Phase 3: PostgreSQL Schema | ✅ Done | All tables converted, numeric type fixes applied |
| Phase 4: Data Migration | ✅ Done | `scripts/migrate-data.ts` — all 7 tables migrated |
| Phase 5: Edge Functions | ⏭️ Skipped | Not needed — Next.js API routes work directly with Supabase PostgreSQL |
| Mobile App | ✅ Done | Native iOS app built with SwiftUI (v1.9.0) |

## Verification Checklist

- [x] Supabase project created with all tables
- [x] Existing data migrated successfully
- [x] Web app works with new backend
- [x] Bank sync works (via Next.js API routes → Supabase)
- [x] iOS app built and functional (native SwiftUI)
