import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { requireAuth } from './middleware/auth';
import { isSupabaseEnabled } from '@budget-app/shared/db/supabase-config';
import { startSyncScheduler } from '@budget-app/shared/db/sync-scheduler';
// Route imports
import databaseRoutes from './routes/database';
import budgetRoutes from './routes/budgets';
import budgetCategoryRoutes from './routes/budget-categories';
import budgetItemRoutes from './routes/budget-items';
import transactionRoutes from './routes/transactions';
import recurringPaymentRoutes from './routes/recurring-payments';
import tellerRoutes from './routes/teller';
import csvRoutes from './routes/csv';
import onboardingRoutes from './routes/onboarding';
import authRoutes from './routes/auth';
import incomeAllocationRoutes from './routes/income-allocations';
import supabaseRoutes from './routes/supabase';
const app = new Hono();
// Middleware
app.use('*', logger());
app.use('*', cors({
    origin: (origin) => {
        // Allow localhost on any port (dev mode)
        if (origin && (origin.startsWith('http://localhost:') || origin.startsWith('http://127.0.0.1:'))) {
            return origin;
        }
        return 'http://localhost:3000';
    },
    allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization'],
    exposeHeaders: ['Content-Length'],
    maxAge: 600,
    credentials: true,
}));
// Health check endpoint (no auth)
app.get('/health', (c) => {
    return c.json({ status: 'ok', timestamp: new Date().toISOString() });
});
// Database routes - mounted BEFORE auth middleware (no auth required)
app.route('/api/database', databaseRoutes);
app.route('/api/supabase', supabaseRoutes);
// Auth middleware for all other /api/* routes
app.use('/api/*', requireAuth());
// Authenticated routes
app.route('/api/budgets', budgetRoutes);
app.route('/api/budget-categories', budgetCategoryRoutes);
app.route('/api/budget-items', budgetItemRoutes);
app.route('/api/transactions', transactionRoutes);
app.route('/api/recurring-payments', recurringPaymentRoutes);
app.route('/api/teller', tellerRoutes);
app.route('/api/csv', csvRoutes);
app.route('/api/onboarding', onboardingRoutes);
app.route('/api/auth/claim-data', authRoutes);
app.route('/api/income-allocations', incomeAllocationRoutes);
// Start the server
const port = parseInt(process.env.API_PORT || '3001', 10);
console.log(`Starting Budget API server on port ${port}...`);
serve({
    fetch: app.fetch,
    port,
}, (info) => {
    console.log(`Budget API server running at http://localhost:${info.port}`);
    // Start sync scheduler if Supabase is configured
    if (isSupabaseEnabled()) {
        startSyncScheduler();
    }
});
export default app;
