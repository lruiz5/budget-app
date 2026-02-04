'use client';

import { useState, useEffect, useCallback } from 'react';
import Script from 'next/script';
import { FaUniversity, FaTrash, FaSync, FaFileUpload, FaUpload } from 'react-icons/fa';
import DashboardLayout from '@/components/DashboardLayout';
import { useToast } from '@/contexts/ToastContext';
import CsvImportModal from '@/components/csv/CsvImportModal';
import DatabaseManagement from '@/components/DatabaseManagement';
import { CsvAccount } from '@/types/csv';

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

  const fetchAccounts = useCallback(async () => {
    try {
      const response = await fetch('/api/teller/accounts');
      if (response.ok) {
        const data = await response.json();
        setAccounts(data);
      }
    } catch (error) {
      console.error('Error fetching accounts:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const fetchCsvAccounts = useCallback(async () => {
    try {
      const response = await fetch('/api/csv/accounts');
      if (response.ok) {
        const data = await response.json();
        setCsvAccounts(data);
      }
    } catch (error) {
      console.error('Error fetching CSV accounts:', error);
    }
  }, []);

  useEffect(() => {
    fetchAccounts();
    fetchCsvAccounts();
  }, [fetchAccounts, fetchCsvAccounts]);

  const handleConnectBank = () => {
    if (!tellerReady || !window.TellerConnect) {
      toast.warning('Teller Connect is not ready yet. Please try again.');
      return;
    }

    const tellerConnect = window.TellerConnect.setup({
      applicationId: process.env.NEXT_PUBLIC_TELLER_APP_ID || '',
      onSuccess: async (enrollment) => {
        try {
          const response = await fetch('/api/teller/accounts', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              accessToken: enrollment.accessToken,
              enrollment: enrollment.enrollment,
            }),
          });

          if (response.ok) {
            fetchAccounts();
            toast.success('Bank account connected successfully');
          } else {
            const errorData = await response.json();
            console.error('Failed to save account:', errorData);
            toast.error(`Failed to save account: ${errorData.error || 'Unknown error'}`);
          }
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
      const response = await fetch(`/api/teller/accounts?id=${id}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        setAccounts(accounts.filter(a => a.id !== id));
      }
    } catch (error) {
      console.error('Error deleting account:', error);
    }
  };

  const handleDeleteCsvAccount = async (id: string) => {
    if (!confirm('Are you sure you want to delete this CSV account? Imported transactions will remain.')) return;

    try {
      const response = await fetch(`/api/csv/accounts?id=${id}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        setCsvAccounts(csvAccounts.filter(a => a.id !== id));
        toast.success('CSV account deleted');
      }
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
      const response = await fetch('/api/teller/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });

      if (response.ok) {
        const result = await response.json();
        setSyncResult({ synced: result.synced, skipped: result.skipped });
        fetchAccounts(); // Refresh to update lastSyncedAt
      }
    } catch (error) {
      console.error('Error syncing:', error);
    } finally {
      setIsSyncing(false);
    }
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return 'Never';
    return new Date(dateString).toLocaleString();
  };

  return (
    <DashboardLayout>
      <Script
        src="https://cdn.teller.io/connect/connect.js"
        onLoad={() => setTellerReady(true)}
      />

      <div className="h-full overflow-y-auto bg-surface-secondary p-4 lg:p-8">
        <div className="max-w-4xl mx-auto">
          <h1 className="text-3xl font-bold text-text-primary mb-8">Accounts</h1>

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
