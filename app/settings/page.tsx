'use client';

import { useState, useEffect, useCallback } from 'react';
import Script from 'next/script';
import { FaUniversity, FaTrash, FaSync, FaFileUpload, FaUpload, FaLink, FaPlus, FaServer, FaDesktop, FaGlobe, FaPen, FaCheck, FaSpinner } from 'react-icons/fa';
import DashboardLayout from '@/components/DashboardLayout';
import { useToast } from '@/contexts/ToastContext';
import { formatTimestamp } from '@/lib/dateHelpers';
import CsvImportModal from '@/components/csv/CsvImportModal';
import DatabaseManagement from '@/components/DatabaseManagement';
import CreditCardDashboard from '@/components/CreditCardDashboard';
import SupabaseSyncPanel from '@/components/SupabaseSyncPanel';
import { CsvAccount } from '@/types/csv';
import { api, IncomeAllocation, getServerUrl, setServerUrl } from '@/lib/api-client';
import { Budget } from '@/types/budget';
import { transformDbBudgetToAppBudget } from '@/lib/budgetHelpers';

interface LinkedAccount {
  id: string;
  tellerAccountId: string;
  institutionName: string;
  accountName: string;
  accountType: string;
  accountSubtype: string;
  lastFour: string;
  status: string;
  lastSyncedAt: string | null;
}

declare global {
  interface Window {
    TellerConnect: {
      setup: (config: {
        applicationId: string;
        onSuccess: (enrollment: { accessToken: string; enrollment: { id: string } }) => void;
        onExit: () => void;
        onFailure?: (error: { type: string; code: string; message: string }) => void;
      }) => {
        open: () => void;
      };
    };
  }
}

export default function SettingsPage() {
  const toast = useToast();
  const [accounts, setAccounts] = useState<LinkedAccount[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<{ synced: number; skipped: number } | null>(null);
  const [tellerReady, setTellerReady] = useState(false);

  // CSV import state
  const [csvAccounts, setCsvAccounts] = useState<CsvAccount[]>([]);
  const [showCsvModal, setShowCsvModal] = useState(false);

  // Server configuration state
  const [editingServer, setEditingServer] = useState(false);
  const [serverMode, setServerMode] = useState<'local' | 'remote'>(() => {
    const url = getServerUrl();
    return url ? 'remote' : 'local';
  });
  const [serverUrlInput, setServerUrlInput] = useState(() => getServerUrl());
  const [serverTesting, setServerTesting] = useState(false);
  const [serverTestResult, setServerTestResult] = useState<'success' | 'error' | null>(null);
  const [serverVersion, setServerVersion] = useState<string | null>(null);

  // Income allocation state
  const [allocations, setAllocations] = useState<IncomeAllocation[]>([]);
  const [currentBudget, setCurrentBudget] = useState<Budget | null>(null);
  const [newAllocationIncome, setNewAllocationIncome] = useState('');
  const [newAllocationCategory, setNewAllocationCategory] = useState('');

  const fetchAccounts = useCallback(async () => {
    try {
      const data = await api.teller.listAccounts();
      setAccounts(data as LinkedAccount[]);
    } catch (error) {
      console.error('Error fetching accounts:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const fetchCsvAccounts = useCallback(async () => {
    try {
      const data = await api.csv.listAccounts();
      setCsvAccounts(data as CsvAccount[]);
    } catch (error) {
      console.error('Error fetching CSV accounts:', error);
    }
  }, []);

  const fetchAllocations = useCallback(async () => {
    try {
      const data = await api.incomeAllocation.list();
      setAllocations(data);
    } catch (error) {
      console.error('Error fetching income allocations:', error);
    }
  }, []);

  const fetchCurrentBudget = useCallback(async () => {
    try {
      const now = new Date();
      const data = await api.budget.get(now.getMonth(), now.getFullYear());
      if (data) {
        setCurrentBudget(transformDbBudgetToAppBudget(data));
      }
    } catch (error) {
      console.error('Error fetching current budget:', error);
    }
  }, []);

  const fetchServerVersion = useCallback(async () => {
    try {
      const baseUrl = getServerUrl() || '';
      const res = await fetch(`${baseUrl}/api/health`);
      const data = await res.json();
      if (data.version) setServerVersion(data.version);
    } catch {
      // Server might not support version yet
    }
  }, []);

  useEffect(() => {
    fetchAccounts();
    fetchCsvAccounts();
    fetchAllocations();
    fetchCurrentBudget();
    fetchServerVersion();
  }, [fetchAccounts, fetchCsvAccounts, fetchAllocations, fetchCurrentBudget, fetchServerVersion]);

  const handleConnectBank = () => {
    if (!tellerReady || !window.TellerConnect) {
      toast.warning('Teller Connect is not ready yet. Please try again.');
      return;
    }

    const tellerConnect = window.TellerConnect.setup({
      applicationId: process.env.NEXT_PUBLIC_TELLER_APP_ID || '',
      onSuccess: async (enrollment) => {
        try {
          await api.teller.linkAccount(
            enrollment.enrollment.id,
            enrollment.accessToken,
            [] // accounts will be fetched by the backend
          );
          fetchAccounts();
          toast.success('Bank account connected successfully');
        } catch (error) {
          console.error('Error saving account:', error);
          toast.error(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      },
      onExit: () => {
        console.log('User exited Teller Connect');
      },
      onFailure: (error) => {
        console.error('Teller Connect failed:', error);
        toast.error(`Failed to connect: ${error.message}`);
      },
    });

    tellerConnect.open();
  };

  const handleDeleteAccount = async (id: string) => {
    if (!confirm('Are you sure you want to disconnect this account?')) return;

    try {
      await api.teller.unlinkAccount(id);
      setAccounts(accounts.filter(a => a.id !== id));
    } catch (error) {
      console.error('Error deleting account:', error);
    }
  };

  const handleDeleteCsvAccount = async (id: string) => {
    if (!confirm('Are you sure you want to delete this CSV account? Imported transactions will remain.')) return;

    try {
      await api.csv.deleteAccount(id);
      setCsvAccounts(csvAccounts.filter(a => a.id !== id));
      toast.success('CSV account deleted');
    } catch (error) {
      console.error('Error deleting CSV account:', error);
      toast.error('Failed to delete CSV account');
    }
  };

  const handleCsvImportComplete = () => {
    fetchCsvAccounts();
    toast.success('CSV import completed successfully');
  };

  const handleSyncAll = async () => {
    setIsSyncing(true);
    setSyncResult(null);

    try {
      const result = await api.teller.syncTransactions() as { synced: number; skipped: number };
      setSyncResult({ synced: result.synced, skipped: result.skipped });
      fetchAccounts(); // Refresh to update lastSyncedAt
    } catch (error) {
      console.error('Error syncing:', error);
    } finally {
      setIsSyncing(false);
    }
  };

  const handleCreateAllocation = async () => {
    if (!newAllocationIncome || !newAllocationCategory) return;
    try {
      await api.incomeAllocation.create({
        incomeItemName: newAllocationIncome,
        targetCategoryType: newAllocationCategory,
      });
      setNewAllocationIncome('');
      setNewAllocationCategory('');
      fetchAllocations();
      toast.success('Income allocation created');
    } catch (error) {
      console.error('Error creating allocation:', error);
      toast.error('Failed to create allocation');
    }
  };

  const handleDeleteAllocation = async (id: string) => {
    try {
      await api.incomeAllocation.delete(id);
      setAllocations(allocations.filter(a => a.id !== id));
      toast.success('Allocation removed');
    } catch (error) {
      console.error('Error deleting allocation:', error);
      toast.error('Failed to remove allocation');
    }
  };

  // Derive income items and expense categories from current budget
  const incomeItems = currentBudget?.categories?.income?.items?.map(i => i.name) || [];
  const expenseCategories = currentBudget
    ? Object.entries(currentBudget.categories)
        .filter(([key]) => key !== 'income')
        .map(([key, cat]) => ({ key, name: cat.name, emoji: cat.emoji }))
    : [];
  // Income items that don't already have an allocation
  const availableIncomeItems = incomeItems.filter(
    name => !allocations.some(a => a.incomeItemName === name)
  );

  const formatDate = formatTimestamp;

  return (
    <DashboardLayout>
      <Script
        src="https://cdn.teller.io/connect/connect.js"
        onLoad={() => setTellerReady(true)}
      />

      <div className="h-full overflow-y-auto bg-surface-secondary p-4 lg:p-8">
        <div className="max-w-4xl mx-auto">
          <h1 className="text-3xl font-bold text-text-primary mb-8">Settings</h1>

          {/* Server Configuration Section */}
          <div className="bg-surface rounded-lg shadow p-6 mb-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <FaServer className="text-text-tertiary" />
                <div>
                  <h2 className="text-xl font-semibold text-text-primary">Server</h2>
                  <p className="text-sm text-text-secondary mt-0.5">
                    {getServerUrl()
                      ? `Connected to ${getServerUrl()}`
                      : 'Running on this machine'}
                    {serverVersion && (
                      <span className="text-text-tertiary ml-2">v{serverVersion}</span>
                    )}
                  </p>
                </div>
              </div>
              {!editingServer && (
                <button
                  onClick={() => setEditingServer(true)}
                  className="flex items-center gap-2 px-3 py-1.5 text-sm text-text-secondary hover:text-text-primary hover:bg-surface-secondary rounded-lg transition-colors"
                >
                  <FaPen className="text-xs" />
                  Change
                </button>
              )}
            </div>

            {editingServer && (
              <div className="border-t border-border pt-4">
                <div className="flex gap-3 mb-4">
                  <button
                    onClick={() => { setServerMode('local'); setServerTestResult(null); }}
                    className={`flex-1 p-4 rounded-lg border-2 transition-all text-left ${
                      serverMode === 'local'
                        ? 'border-primary bg-primary-light'
                        : 'border-border hover:border-border-strong'
                    }`}
                  >
                    <FaDesktop className={`text-lg mb-2 ${serverMode === 'local' ? 'text-primary' : 'text-text-tertiary'}`} />
                    <div className="font-medium text-text-primary text-sm">This machine</div>
                  </button>
                  <button
                    onClick={() => { setServerMode('remote'); setServerTestResult(null); }}
                    className={`flex-1 p-4 rounded-lg border-2 transition-all text-left ${
                      serverMode === 'remote'
                        ? 'border-primary bg-primary-light'
                        : 'border-border hover:border-border-strong'
                    }`}
                  >
                    <FaGlobe className={`text-lg mb-2 ${serverMode === 'remote' ? 'text-primary' : 'text-text-tertiary'}`} />
                    <div className="font-medium text-text-primary text-sm">Remote server</div>
                  </button>
                </div>

                {serverMode === 'remote' && (
                  <div className="mb-4">
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={serverUrlInput}
                        onChange={(e) => { setServerUrlInput(e.target.value); setServerTestResult(null); }}
                        placeholder="http://192.168.1.100:3401"
                        className="flex-1 px-3 py-2 border border-border rounded-lg bg-surface text-text-primary placeholder-text-tertiary text-sm"
                      />
                      <button
                        onClick={async () => {
                          if (!serverUrlInput.trim()) return;
                          setServerTesting(true);
                          setServerTestResult(null);
                          try {
                            const url = serverUrlInput.replace(/\/+$/, '');
                            const res = await fetch(`${url}/health`, { signal: AbortSignal.timeout(5000) });
                            setServerTestResult(res.ok ? 'success' : 'error');
                          } catch {
                            setServerTestResult('error');
                          } finally {
                            setServerTesting(false);
                          }
                        }}
                        disabled={!serverUrlInput.trim() || serverTesting}
                        className="px-3 py-2 border border-border rounded-lg text-text-secondary hover:bg-surface-secondary text-sm disabled:opacity-50"
                      >
                        {serverTesting ? <FaSpinner className="animate-spin" /> : 'Test'}
                      </button>
                    </div>
                    {serverTestResult === 'success' && (
                      <div className="flex items-center gap-2 mt-2 text-success text-sm">
                        <FaCheck /> Connection successful
                      </div>
                    )}
                    {serverTestResult === 'error' && (
                      <div className="mt-2 text-danger text-sm">
                        Could not reach the server. Check the URL and make sure it&apos;s running.
                      </div>
                    )}
                  </div>
                )}

                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      const url = serverMode === 'local' ? '' : serverUrlInput.replace(/\/+$/, '');
                      setServerUrl(url);
                      window.location.reload();
                    }}
                    disabled={serverMode === 'remote' && !serverUrlInput.trim()}
                    className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary-hover text-sm disabled:opacity-50"
                  >
                    Save & Reload
                  </button>
                  <button
                    onClick={() => {
                      setEditingServer(false);
                      setServerMode(getServerUrl() ? 'remote' : 'local');
                      setServerUrlInput(getServerUrl());
                      setServerTestResult(null);
                    }}
                    className="px-4 py-2 text-text-secondary hover:bg-surface-secondary rounded-lg text-sm"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Credit Cards Dashboard */}
          <CreditCardDashboard />

          {/* Bank Connections Section */}
          <div className="bg-surface rounded-lg shadow p-6 mb-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-semibold text-text-primary">
                Linked Bank Accounts
              </h2>
              <div className="flex gap-3">
                {accounts.length > 0 && (
                  <button
                    onClick={handleSyncAll}
                    disabled={isSyncing}
                    className="flex items-center gap-2 px-4 py-2 bg-text-secondary text-white rounded-lg hover:bg-text-secondary disabled:opacity-50"
                  >
                    <FaSync className={isSyncing ? 'animate-spin' : ''} />
                    {isSyncing ? 'Syncing...' : 'Sync All'}
                  </button>
                )}
                <button
                  onClick={handleConnectBank}
                  disabled={!tellerReady}
                  className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary-hover disabled:opacity-50"
                >
                  <FaUniversity />
                  Connect Bank
                </button>
              </div>
            </div>

            {syncResult && (
              <div className="mb-4 p-3 bg-success-light border border-success rounded-lg text-success">
                Sync complete: {syncResult.synced} new transactions imported, {syncResult.skipped} already existed
              </div>
            )}

            {isLoading ? (
              <p className="text-text-secondary">Loading accounts...</p>
            ) : accounts.length === 0 ? (
              <div className="text-center py-8 text-text-secondary">
                <FaUniversity className="mx-auto text-4xl mb-3 text-text-tertiary" />
                <p>No bank accounts connected yet.</p>
                <p className="text-sm mt-1">
                  Click &quot;Connect Bank&quot; to link your bank account and import transactions.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {Object.entries(
                  accounts.reduce<Record<string, LinkedAccount[]>>((groups, account) => {
                    const key = account.institutionName;
                    if (!groups[key]) groups[key] = [];
                    groups[key].push(account);
                    return groups;
                  }, {})
                ).map(([institution, institutionAccounts]) => (
                  <div key={institution} className="bg-surface-secondary rounded-lg border overflow-hidden">
                    {/* Institution header */}
                    <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
                      <div className="w-10 h-10 bg-primary-light rounded-full flex items-center justify-center">
                        <FaUniversity className="text-primary" />
                      </div>
                      <h3 className="font-semibold text-text-primary">{institution}</h3>
                    </div>

                    {/* Accounts under this institution */}
                    <div className="divide-y divide-border">
                      {institutionAccounts.map(account => (
                        <div key={account.id} className="flex items-center justify-between px-4 py-3">
                          <div className="pl-13">
                            <p className="font-medium text-text-primary">
                              {account.accountName} •••• {account.lastFour}
                            </p>
                            <p className="text-xs text-text-tertiary">
                              Last synced: {formatDate(account.lastSyncedAt)}
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            <span
                              className={`px-2 py-1 text-xs rounded-full ${
                                account.status === 'open'
                                  ? 'bg-success-light text-success'
                                  : 'bg-danger-light text-danger'
                              }`}
                            >
                              {account.accountSubtype}
                            </span>
                            <button
                              onClick={() => handleDeleteAccount(account.id)}
                              className="p-2 text-danger hover:bg-danger-light rounded"
                              title="Disconnect account"
                            >
                              <FaTrash />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* CSV Import Section */}
          <div className="bg-surface rounded-lg shadow p-6 mb-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-semibold text-text-primary">
                CSV Import Accounts
              </h2>
              <button
                onClick={() => setShowCsvModal(true)}
                className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary-hover"
              >
                <FaFileUpload />
                Import CSV
              </button>
            </div>

            {csvAccounts.length === 0 ? (
              <div className="text-center py-8 text-text-secondary">
                <FaFileUpload className="mx-auto text-4xl mb-3 text-text-tertiary" />
                <p>No CSV accounts yet.</p>
                <p className="text-sm mt-1">
                  Import transactions from your bank&apos;s CSV export.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {Object.entries(
                  csvAccounts.reduce<Record<string, CsvAccount[]>>((groups, account) => {
                    const key = account.institutionName;
                    if (!groups[key]) groups[key] = [];
                    groups[key].push(account);
                    return groups;
                  }, {})
                ).map(([institution, institutionAccounts]) => (
                  <div key={institution} className="bg-surface-secondary rounded-lg border overflow-hidden">
                    {/* Institution header */}
                    <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
                      <div className="w-10 h-10 bg-primary-light rounded-full flex items-center justify-center">
                        <FaFileUpload className="text-primary" />
                      </div>
                      <h3 className="font-semibold text-text-primary">{institution}</h3>
                    </div>

                    {/* Accounts under this institution */}
                    <div className="divide-y divide-border">
                      {institutionAccounts.map(account => (
                        <div key={account.id} className="flex items-center justify-between px-4 py-3">
                          <div className="pl-13">
                            <p className="font-medium text-text-primary">
                              {account.accountName}
                            </p>
                            <p className="text-xs text-text-tertiary">
                              Last import: {formatDate(account.lastSyncedAt)}
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => setShowCsvModal(true)}
                              className="p-2 text-primary hover:bg-primary-light rounded"
                              title="Import more transactions"
                            >
                              <FaUpload />
                            </button>
                            <button
                              onClick={() => handleDeleteCsvAccount(account.id)}
                              className="p-2 text-danger hover:bg-danger-light rounded"
                              title="Delete account"
                            >
                              <FaTrash />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Instructions */}
          <div className="bg-primary-light border border-primary-border rounded-lg p-4 text-sm text-primary mb-6">
            <p className="font-medium mb-2">How it works:</p>
            <ol className="list-decimal list-inside space-y-1">
              <li>Click &quot;Connect Bank&quot; to securely link your bank account via Teller</li>
              <li>Click &quot;Sync All&quot; to import your latest transactions</li>
              <li>Or click &quot;Import CSV&quot; to upload transactions from a CSV file</li>
              <li>Imported transactions appear as &quot;Uncategorized&quot; on the main budget page</li>
              <li>Assign transactions to budget categories to track your spending</li>
            </ol>
          </div>

          {/* Income Allocation Section */}
          <div className="bg-surface rounded-lg shadow p-6 mb-6">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-xl font-semibold text-text-primary">
                  Income Allocation
                </h2>
                <p className="text-sm text-text-secondary mt-1">
                  Link income sources to expense categories for the Cash Flow diagram
                </p>
              </div>
            </div>

            {/* Existing allocations */}
            {allocations.length > 0 && (
              <div className="space-y-2 mb-4">
                {allocations.map(allocation => {
                  const category = expenseCategories.find(c => c.key === allocation.targetCategoryType);
                  return (
                    <div key={allocation.id} className="flex items-center justify-between px-4 py-3 bg-surface-secondary rounded-lg border">
                      <div className="flex items-center gap-3">
                        <span className="font-medium text-text-primary">{allocation.incomeItemName}</span>
                        <FaLink className="text-text-tertiary text-xs" />
                        <span className="text-text-primary">
                          {category ? `${category.emoji || ''} ${category.name}`.trim() : allocation.targetCategoryType}
                        </span>
                      </div>
                      <button
                        onClick={() => handleDeleteAllocation(allocation.id)}
                        className="p-2 text-danger hover:bg-danger-light rounded"
                        title="Remove allocation"
                      >
                        <FaTrash />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Add new allocation */}
            {availableIncomeItems.length > 0 && expenseCategories.length > 0 ? (
              <div className="flex items-center gap-3">
                <select
                  value={newAllocationIncome}
                  onChange={(e) => setNewAllocationIncome(e.target.value)}
                  className="flex-1 px-3 py-2 border border-border rounded-lg bg-surface text-text-primary"
                >
                  <option value="">Select income source...</option>
                  {availableIncomeItems.map(name => (
                    <option key={name} value={name}>{name}</option>
                  ))}
                </select>
                <FaLink className="text-text-tertiary" />
                <select
                  value={newAllocationCategory}
                  onChange={(e) => setNewAllocationCategory(e.target.value)}
                  className="flex-1 px-3 py-2 border border-border rounded-lg bg-surface text-text-primary"
                >
                  <option value="">Select expense category...</option>
                  {expenseCategories.map(cat => (
                    <option key={cat.key} value={cat.key}>
                      {cat.emoji || ''} {cat.name}
                    </option>
                  ))}
                </select>
                <button
                  onClick={handleCreateAllocation}
                  disabled={!newAllocationIncome || !newAllocationCategory}
                  className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary-hover disabled:opacity-50"
                >
                  <FaPlus />
                  Add
                </button>
              </div>
            ) : allocations.length === 0 ? (
              <div className="text-center py-8 text-text-secondary">
                <FaLink className="mx-auto text-4xl mb-3 text-text-tertiary" />
                <p>No income items found in the current budget.</p>
                <p className="text-sm mt-1">
                  Add income items to your budget first, then link them to expense categories here.
                </p>
              </div>
            ) : (
              <p className="text-sm text-text-secondary">
                All income items have been allocated.
              </p>
            )}
          </div>

          {/* Cloud Sync */}
          <SupabaseSyncPanel />

          {/* Database Management */}
          <DatabaseManagement
            onDatabaseChange={() => {
              fetchAccounts();
              fetchCsvAccounts();
            }}
          />
        </div>
      </div>

      {/* CSV Import Modal */}
      <CsvImportModal
        isOpen={showCsvModal}
        onClose={() => setShowCsvModal(false)}
        onImportComplete={handleCsvImportComplete}
        existingAccounts={csvAccounts}
      />
    </DashboardLayout>
  );
}
