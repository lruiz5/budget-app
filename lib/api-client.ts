/**
 * Centralized API client for Budget App
 *
 * Provides typed methods for all API endpoints.
 * Automatically handles:
 * - Base URL configuration (local vs remote server)
 * - Authentication headers (when using remote server)
 * - Error handling and response parsing
 */

import type {
  Budget,
  Transaction,
  SplitTransaction,
  RecurringPayment,
  CategoryType,
  RecurringFrequency,
} from '@/types/budget';

// API Error class for structured error handling
export class ApiError extends Error {
  constructor(
    public status: number,
    public statusText: string,
    public body?: unknown
  ) {
    super(`API Error ${status}: ${statusText}`);
    this.name = 'ApiError';
  }
}

// Get the API base URL: localStorage > env var > same-origin proxy
function getBaseUrl(): string {
  if (typeof window !== 'undefined') {
    // Check user-configured server URL first
    const stored = localStorage.getItem('serverUrl');
    if (stored) {
      return stored;
    }
    // Fall back to build-time environment variable
    const envUrl = process.env.NEXT_PUBLIC_SERVER_URI;
    if (envUrl) {
      return envUrl;
    }
  }
  // Default to same origin (Next.js proxy → Hono server)
  return '';
}

/**
 * Check if the user has configured the server URL (made a choice during onboarding).
 */
export function isServerConfigured(): boolean {
  if (typeof window === 'undefined') return false;
  return localStorage.getItem('serverConfigured') === 'true';
}

/**
 * Get the stored server URL. Empty string means "this machine" (local proxy).
 */
export function getServerUrl(): string {
  if (typeof window === 'undefined') return '';
  return localStorage.getItem('serverUrl') || '';
}

/**
 * Save the server URL to localStorage. Pass empty string for local mode.
 */
export function setServerUrl(url: string): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem('serverUrl', url);
  localStorage.setItem('serverConfigured', 'true');
}

// Auth token storage (used for remote server mode)
let authToken: string | null = null;

/**
 * Set the authentication token for remote API calls.
 * Not needed for local mode.
 */
export function setAuthToken(token: string | null): void {
  authToken = token;
}

/**
 * Get current auth token.
 */
export function getAuthToken(): string | null {
  return authToken;
}

/**
 * Check if we're in local mode (no auth needed).
 */
export function isLocalMode(): boolean {
  const baseUrl = getBaseUrl();
  if (!baseUrl) return true; // Same origin = local
  try {
    const url = new URL(baseUrl);
    return url.hostname === 'localhost' || url.hostname === '127.0.0.1';
  } catch {
    return true;
  }
}

/**
 * Make an API request with proper headers and error handling.
 */
async function request<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const baseUrl = getBaseUrl();
  const url = `${baseUrl}${endpoint}`;

  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...options.headers,
  };

  // Add auth header for remote mode
  if (!isLocalMode() && authToken) {
    (headers as Record<string, string>)['Authorization'] = `Bearer ${authToken}`;
  }

  const response = await fetch(url, {
    ...options,
    headers,
  });

  const text = await response.text();

  if (!response.ok) {
    let body: unknown = text;
    try {
      body = JSON.parse(text);
    } catch {
      // body stays as text
    }
    throw new ApiError(response.status, response.statusText, body);
  }

  // Handle empty responses
  if (!text) {
    return undefined as T;
  }

  return JSON.parse(text) as T;
}

/**
 * Make an API request with FormData body (for file uploads).
 * Does NOT set Content-Type header (browser sets it with boundary).
 */
async function requestFormData<T>(
  endpoint: string,
  formData: FormData,
  method: string = 'POST'
): Promise<T> {
  const baseUrl = getBaseUrl();
  const url = `${baseUrl}${endpoint}`;

  const headers: HeadersInit = {};

  // Add auth header for remote mode
  if (!isLocalMode() && authToken) {
    (headers as Record<string, string>)['Authorization'] = `Bearer ${authToken}`;
  }

  const response = await fetch(url, {
    method,
    headers,
    body: formData,
  });

  const text = await response.text();

  if (!response.ok) {
    let body: unknown = text;
    try {
      body = JSON.parse(text);
    } catch {
      // body stays as text
    }
    throw new ApiError(response.status, response.statusText, body);
  }

  if (!text) {
    return undefined as T;
  }

  return JSON.parse(text) as T;
}

// ============================================================================
// BUDGET API
// ============================================================================

export const budgetApi = {
  /**
   * Get budget for a specific month/year.
   * Creates a new budget if one doesn't exist.
   */
  async get(month: number, year: number): Promise<unknown> {
    return request(`/api/budgets?month=${month}&year=${year}`);
  },

  /**
   * Update budget (currently just buffer).
   */
  async update(id: string, data: { buffer?: number }): Promise<unknown> {
    return request('/api/budgets', {
      method: 'PUT',
      body: JSON.stringify({ id, ...data }),
    });
  },

  /**
   * Copy budget from a previous month.
   */
  async copy(fromMonth: number, fromYear: number, toMonth: number, toYear: number): Promise<unknown> {
    return request('/api/budgets/copy', {
      method: 'POST',
      body: JSON.stringify({ fromMonth, fromYear, toMonth, toYear }),
    });
  },

  /**
   * Reset budget (zero out or replace with previous month).
   */
  async reset(budgetId: string, mode: 'zero' | 'replace'): Promise<unknown> {
    return request('/api/budgets/reset', {
      method: 'POST',
      body: JSON.stringify({ budgetId, mode }),
    });
  },

  async loadDemo(): Promise<unknown> {
    return request('/api/budgets/demo', {
      method: 'POST',
      body: JSON.stringify({}),
    });
  },
};

// ============================================================================
// BUDGET CATEGORIES API
// ============================================================================

export const categoryApi = {
  /**
   * Create a new custom category.
   */
  async create(budgetId: string, name: string, emoji: string): Promise<unknown> {
    return request('/api/budget-categories', {
      method: 'POST',
      body: JSON.stringify({ budgetId, name, emoji }),
    });
  },

  /**
   * Delete a custom category.
   */
  async delete(id: string): Promise<void> {
    return request(`/api/budget-categories?id=${id}`, {
      method: 'DELETE',
    });
  },
};

// ============================================================================
// BUDGET ITEMS API
// ============================================================================

export const itemApi = {
  /**
   * Create a new budget item.
   */
  async create(categoryId: string, name: string, planned?: number): Promise<unknown> {
    return request('/api/budget-items', {
      method: 'POST',
      body: JSON.stringify({ categoryId, name, planned }),
    });
  },

  /**
   * Update a budget item.
   */
  async update(id: string, data: { name?: string; planned?: number }): Promise<unknown> {
    return request('/api/budget-items', {
      method: 'PUT',
      body: JSON.stringify({ id, ...data }),
    });
  },

  /**
   * Delete a budget item.
   */
  async delete(id: string): Promise<void> {
    return request(`/api/budget-items?id=${id}`, {
      method: 'DELETE',
    });
  },

  /**
   * Reorder items within a category.
   */
  async reorder(items: { id: string; order: number }[]): Promise<void> {
    return request('/api/budget-items/reorder', {
      method: 'PUT',
      body: JSON.stringify({ items }),
    });
  },
};

// ============================================================================
// TRANSACTIONS API
// ============================================================================

export const transactionApi = {
  /**
   * Get a single transaction by ID.
   */
  async get(id: string): Promise<Transaction> {
    return request(`/api/transactions?id=${id}`);
  },

  /**
   * Get all transactions (optionally filtered).
   */
  async list(filters?: { budgetItemId?: string }): Promise<Transaction[]> {
    const params = new URLSearchParams();
    if (filters?.budgetItemId) {
      params.set('budgetItemId', filters.budgetItemId);
    }
    const query = params.toString();
    return request(`/api/transactions${query ? `?${query}` : ''}`);
  },

  /**
   * Get soft-deleted transactions for a specific month/year.
   */
  async listDeleted(month: number, year: number): Promise<Transaction[]> {
    return request(`/api/transactions?deleted=true&month=${month}&year=${year}`);
  },

  /**
   * Create a new transaction.
   */
  async create(data: {
    budgetItemId?: string;
    date: string;
    description: string;
    amount: number;
    type: 'income' | 'expense';
    merchant?: string;
  }): Promise<Transaction> {
    return request('/api/transactions', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  /**
   * Update a transaction.
   */
  async update(id: string, data: Partial<{
    budgetItemId: string | null;
    date: string;
    description: string;
    amount: number;
    type: 'income' | 'expense';
    merchant: string;
  }>): Promise<Transaction> {
    return request('/api/transactions', {
      method: 'PUT',
      body: JSON.stringify({ id, ...data }),
    });
  },

  /**
   * Soft delete a transaction.
   */
  async delete(id: string): Promise<void> {
    return request(`/api/transactions?id=${id}`, {
      method: 'DELETE',
    });
  },

  /**
   * Restore a soft-deleted transaction.
   */
  async restore(id: string): Promise<void> {
    return request('/api/transactions', {
      method: 'PATCH',
      body: JSON.stringify({ id, action: 'restore' }),
    });
  },

  /**
   * Batch assign transactions to budget items.
   */
  async batchAssign(assignments: { transactionId: string; budgetItemId: string }[]): Promise<{ assigned: number; skipped: number; errors?: string[] }> {
    return request('/api/transactions/batch-assign', {
      method: 'POST',
      body: JSON.stringify({ assignments }),
    });
  },
};

// ============================================================================
// SPLIT TRANSACTIONS API
// ============================================================================

export const splitApi = {
  /**
   * Get splits for a transaction.
   */
  async list(transactionId: string): Promise<SplitTransaction[]> {
    return request(`/api/transactions/split?transactionId=${transactionId}`);
  },

  /**
   * Create/update splits for a transaction.
   */
  async save(transactionId: string, splits: { budgetItemId: string; amount: number; description?: string }[]): Promise<void> {
    return request('/api/transactions/split', {
      method: 'POST',
      body: JSON.stringify({ transactionId, splits }),
    });
  },

  /**
   * Delete all splits for a transaction (unsplit).
   */
  async delete(transactionId: string): Promise<void> {
    return request(`/api/transactions/split?transactionId=${transactionId}`, {
      method: 'DELETE',
    });
  },
};

// ============================================================================
// RECURRING PAYMENTS API
// ============================================================================

export const recurringApi = {
  /**
   * List all recurring payments.
   */
  async list(): Promise<RecurringPayment[]> {
    return request('/api/recurring-payments');
  },

  /**
   * Create a new recurring payment.
   */
  async create(data: {
    name: string;
    amount: string;
    frequency: RecurringFrequency;
    nextDueDate: string;
    categoryType?: CategoryType;
    budgetItemId?: string;
  }): Promise<RecurringPayment> {
    return request('/api/recurring-payments', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  /**
   * Update a recurring payment.
   */
  async update(id: string, data: Partial<{
    name: string;
    amount: string;
    frequency: RecurringFrequency;
    nextDueDate: string;
    categoryType: CategoryType;
  }>): Promise<RecurringPayment> {
    return request('/api/recurring-payments', {
      method: 'PUT',
      body: JSON.stringify({ id, ...data }),
    });
  },

  /**
   * Delete a recurring payment.
   */
  async delete(id: string): Promise<void> {
    return request(`/api/recurring-payments?id=${id}`, {
      method: 'DELETE',
    });
  },

  /**
   * Record a contribution to a recurring payment.
   */
  async contribute(id: string, amount: number): Promise<void> {
    return request('/api/recurring-payments/contribute', {
      method: 'POST',
      body: JSON.stringify({ id, amount }),
    });
  },

  /**
   * Reset a recurring payment (advance due date, clear funded amount).
   */
  async reset(id: string): Promise<void> {
    return request('/api/recurring-payments/reset', {
      method: 'POST',
      body: JSON.stringify({ id }),
    });
  },
};

// ============================================================================
// TELLER (BANK INTEGRATION) API
// ============================================================================

export const tellerApi = {
  /**
   * List linked bank accounts.
   */
  async listAccounts(): Promise<unknown[]> {
    return request('/api/teller/accounts');
  },

  /**
   * Link a new bank account.
   */
  async linkAccount(enrollmentId: string, accessToken: string, accounts: unknown[]): Promise<void> {
    return request('/api/teller/accounts', {
      method: 'POST',
      body: JSON.stringify({ enrollmentId, accessToken, accounts }),
    });
  },

  /**
   * Unlink a bank account.
   */
  async unlinkAccount(id: string): Promise<void> {
    return request(`/api/teller/accounts?id=${id}`, {
      method: 'DELETE',
    });
  },

  /**
   * Get uncategorized transactions from linked accounts.
   */
  async getTransactions(month: number, year: number): Promise<unknown> {
    return request(`/api/teller/sync?month=${month}&year=${year}`);
  },

  /**
   * Sync transactions from linked accounts.
   */
  async syncTransactions(): Promise<unknown> {
    return request('/api/teller/sync', {
      method: 'POST',
    });
  },
};

// ============================================================================
// CSV IMPORT API
// ============================================================================

export const csvApi = {
  /**
   * List CSV accounts.
   */
  async listAccounts(): Promise<unknown[]> {
    return request('/api/csv/accounts');
  },

  /**
   * Create a CSV account.
   */
  async createAccount(data: {
    accountName: string;
    institutionName: string;
    columnMapping?: unknown;
  }): Promise<unknown> {
    return request('/api/csv/accounts', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  /**
   * Delete a CSV account.
   */
  async deleteAccount(id: string): Promise<void> {
    return request(`/api/csv/accounts?id=${id}`, {
      method: 'DELETE',
    });
  },

  /**
   * Upload and preview a CSV file (parse headers and sample rows).
   */
  async uploadPreview(formData: FormData): Promise<unknown> {
    return requestFormData('/api/csv/preview', formData, 'POST');
  },

  /**
   * Preview import with column mapping applied (returns parsed transactions).
   */
  async previewImport(formData: FormData): Promise<unknown> {
    return requestFormData('/api/csv/import', formData, 'PUT');
  },

  /**
   * Import transactions from CSV file.
   */
  async importFile(formData: FormData): Promise<unknown> {
    return requestFormData('/api/csv/import', formData, 'POST');
  },
};

// ============================================================================
// ONBOARDING API
// ============================================================================

export const onboardingApi = {
  /**
   * Get onboarding status.
   */
  async getStatus(): Promise<{ completed: boolean; currentStep: number } | null> {
    return request('/api/onboarding');
  },

  /**
   * Initialize onboarding for new user.
   */
  async initialize(): Promise<void> {
    return request('/api/onboarding', {
      method: 'POST',
    });
  },

  /**
   * Update current step.
   */
  async updateStep(step: number): Promise<void> {
    return request('/api/onboarding', {
      method: 'PUT',
      body: JSON.stringify({ step }),
    });
  },

  /**
   * Complete or skip onboarding.
   */
  async finish(action: 'complete' | 'skip'): Promise<void> {
    return request('/api/onboarding', {
      method: 'PATCH',
      body: JSON.stringify({ action }),
    });
  },
};

// ============================================================================
// INCOME ALLOCATIONS API
// ============================================================================

export interface IncomeAllocation {
  id: string;
  userId: string;
  incomeItemName: string;
  targetCategoryType: string;
  createdAt: string;
}

export const incomeAllocationApi = {
  /**
   * List all income allocations for the user.
   */
  async list(): Promise<IncomeAllocation[]> {
    return request('/api/income-allocations');
  },

  /**
   * Create or update an income allocation (upserts by incomeItemName).
   */
  async create(data: { incomeItemName: string; targetCategoryType: string }): Promise<IncomeAllocation> {
    return request('/api/income-allocations', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  /**
   * Delete an income allocation.
   */
  async delete(id: string): Promise<void> {
    return request(`/api/income-allocations/${id}`, {
      method: 'DELETE',
    });
  },
};

// ============================================================================
// DATABASE MANAGEMENT API
// ============================================================================

export const databaseApi = {
  /**
   * Get database status.
   */
  async getStatus(): Promise<{
    status: {
      initialized: boolean;
      hasError: boolean;
      errorMessage: string | null;
      dbPath: string;
    };
    backups: { path: string; timestamp: string }[];
    hasCloudConnection: boolean;
  }> {
    return request('/api/database');
  },

  /**
   * Create a database backup.
   */
  async backup(): Promise<{ backupPath: string }> {
    return request('/api/database', {
      method: 'POST',
      body: JSON.stringify({ action: 'backup' }),
    });
  },

  /**
   * Restore from a backup.
   */
  async restore(backupPath: string): Promise<void> {
    return request('/api/database', {
      method: 'POST',
      body: JSON.stringify({ action: 'restore', backupPath }),
    });
  },

  /**
   * Delete the local database.
   */
  async delete(): Promise<{ backupPath: string }> {
    return request('/api/database', {
      method: 'DELETE',
    });
  },

  /**
   * Delete a specific backup.
   */
  async deleteBackup(backupPath: string): Promise<void> {
    return request('/api/database', {
      method: 'POST',
      body: JSON.stringify({ action: 'deleteBackup', backupPath }),
    });
  },

  /**
   * Sync from cloud database (replace local with cloud data).
   */
  async syncFromCloud(): Promise<{ success: boolean; message: string }> {
    return request('/api/database', {
      method: 'POST',
      body: JSON.stringify({ action: 'syncFromCloud' }),
    });
  },
};

// ============================================================================
// SUPABASE SYNC API
// ============================================================================

export const supabaseApi = {
  /**
   * Get Supabase configuration (masked).
   */
  async getConfig(): Promise<{
    enabled: boolean;
    databaseUrl: string;
    lastSyncAt: string | null;
    instanceId: string;
  }> {
    return request('/api/supabase/config');
  },

  /**
   * Update Supabase configuration.
   */
  async updateConfig(data: {
    databaseUrl?: string;
    enabled?: boolean;
  }): Promise<{
    enabled: boolean;
    databaseUrl: string;
    lastSyncAt: string | null;
    instanceId: string;
  }> {
    return request('/api/supabase/config', {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  /**
   * Test the Supabase connection.
   */
  async testConnection(): Promise<{ success: boolean; message: string }> {
    return request('/api/supabase/test-connection', {
      method: 'POST',
    });
  },

  /**
   * Create/verify schema on Supabase.
   */
  async setupSchema(): Promise<{ success: boolean; message: string }> {
    return request('/api/supabase/setup-schema', {
      method: 'POST',
    });
  },

  /**
   * Get sync status.
   */
  async getStatus(): Promise<{
    state: string;
    pendingCount: number;
    lastError: string | null;
    consecutiveFailures: number;
    enabled: boolean;
    lastSyncAt: string | null;
    instanceId: string;
  }> {
    return request('/api/supabase/status');
  },

  /**
   * Get pending/errored changelog entries.
   */
  async getChangelog(): Promise<{
    entries: Array<{
      id: number;
      table_name: string;
      record_id: string;
      operation: string;
      changed_at: string;
      error_message?: string;
    }>;
    pendingCount: number;
  }> {
    return request('/api/supabase/changelog');
  },

  /**
   * Find conflicts between local and remote.
   */
  async getAudit(): Promise<{
    conflicts: Array<{
      table: string;
      recordId: string;
      localData: Record<string, unknown> | null;
      remoteData: Record<string, unknown> | null;
      changelogId: number;
    }>;
  }> {
    return request('/api/supabase/audit');
  },

  /**
   * Resolve a sync conflict.
   */
  async resolveConflict(
    changelogId: number,
    strategy: 'keep-local' | 'use-remote' | 'discard'
  ): Promise<{ success: boolean; message: string }> {
    return request('/api/supabase/resolve-conflict', {
      method: 'POST',
      body: JSON.stringify({ changelogId, strategy }),
    });
  },

  /**
   * Trigger a manual sync.
   */
  async sync(): Promise<{
    success: boolean;
    error?: string;
    result?: {
      pushed: number;
      pulled: number;
      skippedPush: number;
      skippedPull: number;
      pushErrors: number;
      pullErrors: number;
    };
  }> {
    return request('/api/supabase/sync', {
      method: 'POST',
    });
  },

  /**
   * Run initial sync (first-time setup).
   */
  async initialSync(direction: 'push' | 'pull' | 'merge'): Promise<{
    success: boolean;
    message: string;
    error?: string;
    stats?: { pushed: number; pulled: number; errors: number };
  }> {
    return request('/api/supabase/initial-sync', {
      method: 'POST',
      body: JSON.stringify({ direction }),
    });
  },
};

// ============================================================================
// CONVENIENCE EXPORTS
// ============================================================================

/**
 * All API modules combined for easy import.
 * Usage: import { api } from '@/lib/api-client';
 *        await api.budget.get(0, 2026);
 */
export const api = {
  budget: budgetApi,
  category: categoryApi,
  item: itemApi,
  transaction: transactionApi,
  split: splitApi,
  recurring: recurringApi,
  teller: tellerApi,
  csv: csvApi,
  onboarding: onboardingApi,
  database: databaseApi,
  incomeAllocation: incomeAllocationApi,
  supabase: supabaseApi,
};

export default api;
