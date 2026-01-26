'use client';

import { useState, useEffect, useCallback } from 'react';
import Script from 'next/script';
import { FaUniversity, FaTrash, FaSync } from 'react-icons/fa';
import DashboardLayout from '@/components/DashboardLayout';

interface LinkedAccount {
  id: number;
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
  const [accounts, setAccounts] = useState<LinkedAccount[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<{ synced: number; skipped: number } | null>(null);
  const [tellerReady, setTellerReady] = useState(false);

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

  useEffect(() => {
    fetchAccounts();
  }, [fetchAccounts]);

  const handleConnectBank = () => {
    if (!tellerReady || !window.TellerConnect) {
      alert('Teller Connect is not ready yet. Please try again.');
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
          } else {
            const errorData = await response.json();
            console.error('Failed to save account:', errorData);
            alert(`Failed to save account: ${errorData.error || 'Unknown error'}`);
          }
        } catch (error) {
          console.error('Error saving account:', error);
          alert(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      },
      onExit: () => {
        console.log('User exited Teller Connect');
      },
      onFailure: (error) => {
        console.error('Teller Connect failed:', error);
        alert(`Failed to connect: ${error.message}`);
      },
    });

    tellerConnect.open();
  };

  const handleDeleteAccount = async (id: number) => {
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

      <div className="h-full overflow-y-auto bg-gray-100 p-8">
        <div className="max-w-4xl mx-auto">
          <h1 className="text-3xl font-bold text-gray-900 mb-8">Accounts</h1>

          {/* Bank Connections Section */}
          <div className="bg-white rounded-lg shadow p-6 mb-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-semibold text-gray-900">
                Linked Bank Accounts
              </h2>
              <div className="flex gap-3">
                {accounts.length > 0 && (
                  <button
                    onClick={handleSyncAll}
                    disabled={isSyncing}
                    className="flex items-center gap-2 px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 disabled:opacity-50"
                  >
                    <FaSync className={isSyncing ? 'animate-spin' : ''} />
                    {isSyncing ? 'Syncing...' : 'Sync All'}
                  </button>
                )}
                <button
                  onClick={handleConnectBank}
                  disabled={!tellerReady}
                  className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                >
                  <FaUniversity />
                  Connect Bank
                </button>
              </div>
            </div>

            {syncResult && (
              <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg text-green-800">
                Sync complete: {syncResult.synced} new transactions imported, {syncResult.skipped} already existed
              </div>
            )}

            {isLoading ? (
              <p className="text-gray-500">Loading accounts...</p>
            ) : accounts.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <FaUniversity className="mx-auto text-4xl mb-3 text-gray-300" />
                <p>No bank accounts connected yet.</p>
                <p className="text-sm mt-1">
                  Click &quot;Connect Bank&quot; to link your bank account and import transactions.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {accounts.map(account => (
                  <div
                    key={account.id}
                    className="flex items-center justify-between p-4 bg-gray-50 rounded-lg border"
                  >
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center">
                        <FaUniversity className="text-blue-600" />
                      </div>
                      <div>
                        <p className="font-medium text-gray-900">
                          {account.institutionName}
                        </p>
                        <p className="text-sm text-gray-600">
                          {account.accountName} •••• {account.lastFour}
                        </p>
                        <p className="text-xs text-gray-400">
                          Last synced: {formatDate(account.lastSyncedAt)}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span
                        className={`px-2 py-1 text-xs rounded-full ${
                          account.status === 'open'
                            ? 'bg-green-100 text-green-800'
                            : 'bg-red-100 text-red-800'
                        }`}
                      >
                        {account.accountSubtype}
                      </span>
                      <button
                        onClick={() => handleDeleteAccount(account.id)}
                        className="p-2 text-red-500 hover:bg-red-50 rounded"
                        title="Disconnect account"
                      >
                        <FaTrash />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Instructions */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm text-blue-800">
            <p className="font-medium mb-2">How it works:</p>
            <ol className="list-decimal list-inside space-y-1">
              <li>Click &quot;Connect Bank&quot; to securely link your bank account via Teller</li>
              <li>Click &quot;Sync All&quot; to import your latest transactions</li>
              <li>Imported transactions appear as &quot;Uncategorized&quot; on the main budget page</li>
              <li>Assign transactions to budget categories to track your spending</li>
            </ol>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
