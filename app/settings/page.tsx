'use client';

import { useState, useEffect, useCallback } from 'react';
import { Landmark, Trash2, RefreshCw, ExternalLink } from "lucide-react";
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Modal from '@/components/ui/Modal';
import Skeleton from '@/components/ui/Skeleton';
import DashboardLayout from '@/components/DashboardLayout';
import { useToast } from '@/contexts/ToastContext';

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
  syncEnabled: boolean;
}

export default function SettingsPage() {
  const toast = useToast();
  const [accounts, setAccounts] = useState<LinkedAccount[]>([]);
  const [balances, setBalances] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<{ synced: number; skipped: number } | null>(null);
  const [showConnectModal, setShowConnectModal] = useState(false);
  const [setupToken, setSetupToken] = useState('');
  const [syncStartDate, setSyncStartDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [isConnecting, setIsConnecting] = useState(false);

  const fetchBalances = useCallback(async () => {
    try {
      const response = await fetch('/api/teller/balances');
      if (response.ok) {
        const data = await response.json();
        setBalances(data);
      }
    } catch (error) {
      console.error('Error fetching balances:', error);
    }
  }, []);

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
    fetchAccounts().then(() => fetchBalances());
  }, [fetchAccounts, fetchBalances]);

  const handleConnectSubmit = async () => {
    if (!setupToken.trim()) {
      toast.warning('Paste your SimpleFIN Setup Token first.');
      return;
    }

    setIsConnecting(true);
    try {
      const response = await fetch('/api/simplefin/claim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ setupToken: setupToken.trim(), syncStartDate }),
      });

      const data = await response.json();
      if (response.ok) {
        setShowConnectModal(false);
        setSetupToken('');
        fetchAccounts().then(() => fetchBalances());
        toast.success(`Connected ${data.accounts.length} account${data.accounts.length === 1 ? '' : 's'}`);
      } else {
        console.error('Failed to connect SimpleFIN:', data);
        toast.error(data.error || 'Failed to connect');
      }
    } catch (error) {
      console.error('Error connecting SimpleFIN:', error);
      toast.error(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsConnecting(false);
    }
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

  const handleToggleSync = async (accountId: number, currentState: boolean) => {
    setAccounts(prev => prev.map(a => a.id === accountId ? { ...a, syncEnabled: !currentState } : a));
    try {
      const response = await fetch('/api/teller/accounts', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: accountId, syncEnabled: !currentState }),
      });
      if (!response.ok) {
        setAccounts(prev => prev.map(a => a.id === accountId ? { ...a, syncEnabled: currentState } : a));
        toast.error('Failed to update sync setting');
      }
    } catch {
      setAccounts(prev => prev.map(a => a.id === accountId ? { ...a, syncEnabled: currentState } : a));
      toast.error('Failed to update sync setting');
    }
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return 'Never';
    return new Date(dateString).toLocaleString();
  };

  return (
    <DashboardLayout>
      <div className="h-full overflow-y-auto bg-surface-secondary p-4 lg:p-8">
        <div className="max-w-4xl mx-auto">
          <h1 className="text-3xl font-bold text-text-primary mb-8">Accounts</h1>

          {/* Bank Connections Section */}
          <Card className="p-6 mb-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-semibold text-text-primary">
                Linked Bank Accounts
              </h2>
              <div className="flex gap-3">
                {accounts.length > 0 && (
                  <Button variant="secondary" onClick={handleSyncAll} disabled={isSyncing}>
                    <RefreshCw size={16} className={isSyncing ? 'animate-spin' : ''} />
                    {isSyncing ? 'Syncing...' : 'Sync All'}
                  </Button>
                )}
                <Button onClick={() => setShowConnectModal(true)}>
                  <Landmark size={16} />
                  Connect Bank
                </Button>
              </div>
            </div>

            {syncResult && (
              <div className="mb-4 p-3 bg-success-light border border-success rounded-lg text-success">
                Sync complete: {syncResult.synced} new transactions imported, {syncResult.skipped} already existed
              </div>
            )}

            {isLoading ? (
              <div className="space-y-4">
                {[0, 1].map((i) => (
                  <div key={i} className="flex items-center gap-3 py-3">
                    <Skeleton className="w-10 h-10 rounded-full flex-shrink-0" />
                    <div className="flex-1 space-y-1.5">
                      <Skeleton className="h-4 w-48" />
                      <Skeleton className="h-3 w-32" />
                    </div>
                    <Skeleton className="h-6 w-16 rounded-full" />
                  </div>
                ))}
              </div>
            ) : accounts.length === 0 ? (
              <div className="text-center py-8 text-text-secondary">
                <Landmark size={36} className="mx-auto mb-3 text-text-tertiary" />
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
                        <Landmark size={16} className="text-primary" />
                      </div>
                      <h3 className="font-semibold text-text-primary">{institution}</h3>
                    </div>

                    {/* Accounts under this institution */}
                    <div className="divide-y divide-border">
                      {institutionAccounts.map(account => (
                        <div key={account.id} className={`flex items-center justify-between px-4 py-3 transition-opacity ${!account.syncEnabled ? 'opacity-60' : ''}`}>
                          <div className="pl-13">
                            <p className="font-medium text-text-primary">
                              {account.accountName}
                              {account.lastFour && !account.accountName.endsWith(account.lastFour)
                                ? ` •••• ${account.lastFour}`
                                : ''}
                            </p>
                            <p className="text-xs text-text-tertiary">
                              Last synced: {formatDate(account.lastSyncedAt)}
                            </p>
                          </div>
                          <div className="flex items-center gap-3">
                            {balances[String(account.id)] && (
                              <span className="text-sm font-semibold text-text-primary">
                                ${parseFloat(balances[String(account.id)]).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </span>
                            )}
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
                              onClick={() => handleToggleSync(account.id, account.syncEnabled)}
                              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                                account.syncEnabled ? 'bg-primary' : 'bg-border-strong'
                              }`}
                              title={account.syncEnabled ? 'Sync enabled' : 'Sync disabled'}
                            >
                              <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                                account.syncEnabled ? 'translate-x-6' : 'translate-x-1'
                              }`} />
                            </button>
                            <button
                              onClick={() => handleDeleteAccount(account.id)}
                              className="p-2 text-danger hover:bg-danger-light rounded"
                              title="Disconnect account"
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>

          {/* Instructions */}
          <div className="bg-primary-light border border-primary-border rounded-lg p-4 text-sm text-primary">
            <p className="font-medium mb-2">How it works:</p>
            <ol className="list-decimal list-inside space-y-1">
              <li>
                Create a SimpleFIN Bridge account and connect your banks at{' '}
                <a
                  href="https://bridge.simplefin.org"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline font-medium"
                >
                  bridge.simplefin.org
                </a>
              </li>
              <li>Generate a Setup Token there, then click &quot;Connect Bank&quot; and paste it</li>
              <li>Click &quot;Sync All&quot; to import your latest transactions</li>
              <li>Imported transactions appear as &quot;Uncategorized&quot; on the main budget page</li>
              <li>Assign transactions to budget categories to track your spending</li>
            </ol>
          </div>
        </div>
      </div>

      {/* SimpleFIN Setup Token modal */}
      <Modal
        isOpen={showConnectModal}
        onClose={() => setShowConnectModal(false)}
        title="Connect Bank via SimpleFIN"
        footer={
          <div className="flex justify-end gap-3">
            <Button variant="secondary" onClick={() => setShowConnectModal(false)}>
              Cancel
            </Button>
            <Button onClick={handleConnectSubmit} disabled={isConnecting || !setupToken.trim()}>
              {isConnecting ? 'Connecting...' : 'Connect'}
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <p className="text-sm text-text-secondary">
            Get a Setup Token from{' '}
            <a
              href="https://bridge.simplefin.org"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary underline inline-flex items-center gap-1"
            >
              SimpleFIN Bridge <ExternalLink size={12} />
            </a>{' '}
            (Settings → New App Connection) and paste it below. Tokens are single-use.
          </p>

          <div>
            <label className="block text-sm font-medium text-text-primary mb-1">Setup Token</label>
            <textarea
              value={setupToken}
              onChange={(e) => setSetupToken(e.target.value)}
              rows={4}
              placeholder="aHR0cHM6Ly9icmlkZ2Uuc2ltcGxlZmluLm9yZy9zaW1wbGVmaW4vY2xhaW0v..."
              className="w-full px-3 py-2 border border-border-strong rounded-lg bg-surface text-text-primary placeholder:text-text-tertiary font-mono text-xs break-all focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-text-primary mb-1">
              Import transactions from
            </label>
            <Input
              type="date"
              value={syncStartDate}
              onChange={(e) => setSyncStartDate(e.target.value)}
            />
            <p className="text-xs text-text-tertiary mt-1">
              Transactions before this date won&apos;t be imported — set it to the day after your
              existing history ends to avoid duplicates.
            </p>
          </div>
        </div>
      </Modal>
    </DashboardLayout>
  );
}
