'use client';

import { useState, useEffect, useCallback } from 'react';
import { FaDatabase, FaSync, FaCheck, FaExclamationTriangle, FaWifi, FaTimes, FaSpinner, FaCloudUploadAlt, FaCloudDownloadAlt, FaExchangeAlt } from 'react-icons/fa';
import { api } from '@/lib/api-client';
import { useToast } from '@/contexts/ToastContext';

interface SyncConfig {
  enabled: boolean;
  databaseUrl: string;
  lastSyncAt: string | null;
  instanceId: string;
}

interface SyncStatusData {
  state: string;
  pendingCount: number;
  lastError: string | null;
  consecutiveFailures: number;
  enabled: boolean;
  lastSyncAt: string | null;
  instanceId: string;
}

interface ChangelogEntry {
  id: number;
  table_name: string;
  record_id: string;
  operation: string;
  changed_at: string;
  error_message?: string;
}

interface Conflict {
  table: string;
  recordId: string;
  localData: Record<string, unknown> | null;
  remoteData: Record<string, unknown> | null;
  changelogId: number;
}

export default function SupabaseSyncPanel() {
  const toast = useToast();

  const [config, setConfig] = useState<SyncConfig | null>(null);
  const [status, setStatus] = useState<SyncStatusData | null>(null);
  const [conflicts, setConflicts] = useState<Conflict[]>([]);
  const [loading, setLoading] = useState(true);

  // Form state
  const [dbUrl, setDbUrl] = useState('');
  const [showDbUrl, setShowDbUrl] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [settingUpSchema, setSettingUpSchema] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [initialSyncing, setInitialSyncing] = useState(false);
  const [initialSyncDirection, setInitialSyncDirection] = useState<'push' | 'pull' | 'merge'>('push');
  const [resolvingIds, setResolvingIds] = useState<Set<number>>(new Set());
  const [bulkResolving, setBulkResolving] = useState(false);

  const fetchConfig = useCallback(async () => {
    try {
      const data = await api.supabase.getConfig();
      setConfig(data);
      setDbUrl('');
    } catch (error) {
      console.error('Error fetching supabase config:', error);
    }
  }, []);

  const fetchStatus = useCallback(async () => {
    try {
      const data = await api.supabase.getStatus();
      setStatus(data);
    } catch (error) {
      console.error('Error fetching sync status:', error);
    }
  }, []);

  const fetchConflicts = useCallback(async () => {
    try {
      const data = await api.supabase.getAudit();
      setConflicts(data.conflicts || []);
    } catch (error) {
      console.error('Error fetching conflicts:', error);
    }
  }, []);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      await Promise.all([fetchConfig(), fetchStatus(), fetchConflicts()]);
      setLoading(false);
    };
    load();
  }, [fetchConfig, fetchStatus, fetchConflicts]);

  // Auto-refresh status every 10 seconds when enabled
  useEffect(() => {
    if (!config?.enabled) return;
    const interval = setInterval(fetchStatus, 10_000);
    return () => clearInterval(interval);
  }, [config?.enabled, fetchStatus]);

  const handleSaveConfig = async () => {
    try {
      const updates: { databaseUrl?: string; enabled?: boolean } = {};
      if (dbUrl.trim()) {
        updates.databaseUrl = dbUrl.trim();
      }
      const data = await api.supabase.updateConfig(updates);
      setConfig(data);
      setDbUrl('');
      setShowDbUrl(false);
      setTestResult(null);
      toast.success('Supabase configuration saved');
      fetchStatus();
    } catch (error) {
      toast.error('Failed to save configuration');
    }
  };

  const handleToggleEnabled = async () => {
    try {
      const data = await api.supabase.updateConfig({ enabled: !config?.enabled });
      setConfig(data);
      fetchStatus();
      toast.success(data.enabled ? 'Sync enabled' : 'Sync disabled');
    } catch (error) {
      toast.error('Failed to toggle sync');
    }
  };

  const handleTestConnection = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const result = await api.supabase.testConnection();
      setTestResult(result);
    } catch (error) {
      setTestResult({ success: false, message: 'Connection test failed' });
    } finally {
      setTesting(false);
    }
  };

  const handleSetupSchema = async () => {
    setSettingUpSchema(true);
    try {
      const result = await api.supabase.setupSchema();
      if (result.success) {
        toast.success('Schema created on Supabase');
      } else {
        toast.error(result.message);
      }
    } catch (error) {
      toast.error('Failed to setup schema');
    } finally {
      setSettingUpSchema(false);
    }
  };

  const handleSync = async () => {
    setSyncing(true);
    try {
      const result = await api.supabase.sync();
      if (result.success && result.result) {
        const r = result.result;
        const totalErrors = (r.pushErrors || 0) + (r.pullErrors || 0);
        if (totalErrors > 0) {
          toast.error(`Sync completed with ${totalErrors} error(s). Pushed: ${r.pushed}, Pulled: ${r.pulled}`);
        } else {
          toast.success(`Sync complete: pushed ${r.pushed}, pulled ${r.pulled}`);
        }
      } else {
        toast.error(result.error || 'Sync failed');
      }
      await fetchStatus();
      await fetchConflicts();
    } catch (error) {
      toast.error('Sync failed');
    } finally {
      setSyncing(false);
    }
  };

  const handleInitialSync = async () => {
    setInitialSyncing(true);
    try {
      const result = await api.supabase.initialSync(initialSyncDirection);
      if (result.success) {
        const stats = result.stats;
        if (stats?.errors && stats.errors > 0) {
          toast.error(`Sync completed with ${stats.errors} error(s). Pushed: ${stats.pushed}, Pulled: ${stats.pulled}`);
        } else {
          toast.success(result.message);
        }
      } else {
        toast.error(result.error || 'Initial sync failed');
      }
      await fetchConfig();
      await fetchStatus();
    } catch (error) {
      toast.error('Initial sync failed');
    } finally {
      setInitialSyncing(false);
    }
  };

  const handleResolveConflict = async (changelogId: number, strategy: 'keep-local' | 'use-remote' | 'discard') => {
    setResolvingIds(prev => new Set(prev).add(changelogId));
    try {
      const result = await api.supabase.resolveConflict(changelogId, strategy);
      if (result.success) {
        toast.success(result.message);
        fetchConflicts();
        fetchStatus();
      }
    } catch (error) {
      toast.error('Failed to resolve conflict');
    } finally {
      setResolvingIds(prev => {
        const next = new Set(prev);
        next.delete(changelogId);
        return next;
      });
    }
  };

  const handleBulkResolve = async (strategy: 'keep-local' | 'use-remote' | 'discard') => {
    const label = strategy === 'keep-local' ? 'Keep Local' : strategy === 'use-remote' ? 'Use Remote' : 'Discard';
    setBulkResolving(true);
    let succeeded = 0;
    let failed = 0;

    for (const conflict of conflicts) {
      setResolvingIds(prev => new Set(prev).add(conflict.changelogId));
      try {
        const result = await api.supabase.resolveConflict(conflict.changelogId, strategy);
        if (result.success) succeeded++;
        else failed++;
      } catch {
        failed++;
      } finally {
        setResolvingIds(prev => {
          const next = new Set(prev);
          next.delete(conflict.changelogId);
          return next;
        });
      }
    }

    setBulkResolving(false);

    if (failed === 0) {
      toast.success(`${label}: resolved ${succeeded} conflict(s)`);
    } else {
      toast.error(`${label}: ${succeeded} resolved, ${failed} failed`);
    }

    fetchConflicts();
    fetchStatus();
  };

  const getStateBadge = (state: string) => {
    switch (state) {
      case 'idle':
        return <span className="flex items-center gap-1.5 text-success text-sm"><FaCheck /> Idle</span>;
      case 'syncing':
        return <span className="flex items-center gap-1.5 text-primary text-sm"><FaSync className="animate-spin" /> Syncing</span>;
      case 'offline':
        return <span className="flex items-center gap-1.5 text-warning text-sm"><FaWifi /> Offline</span>;
      case 'error':
        return <span className="flex items-center gap-1.5 text-danger text-sm"><FaExclamationTriangle /> Error</span>;
      case 'disabled':
        return <span className="flex items-center gap-1.5 text-text-tertiary text-sm"><FaTimes /> Disabled</span>;
      default:
        return <span className="text-text-secondary text-sm">{state}</span>;
    }
  };

  if (loading) {
    return (
      <div className="bg-surface rounded-lg shadow p-6 mb-6">
        <div className="flex items-center gap-3">
          <FaDatabase className="text-text-tertiary" />
          <h2 className="text-xl font-semibold text-text-primary">Cloud Sync</h2>
        </div>
        <div className="flex items-center justify-center py-8 text-text-secondary">
          <FaSpinner className="animate-spin mr-2" /> Loading...
        </div>
      </div>
    );
  }

  return (
    <div className="bg-surface rounded-lg shadow p-6 mb-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <FaDatabase className="text-text-tertiary" />
          <div>
            <h2 className="text-xl font-semibold text-text-primary">Cloud Sync</h2>
            <p className="text-sm text-text-secondary mt-0.5">
              Sync your local database with Supabase
            </p>
          </div>
        </div>
        {config?.databaseUrl && (
          <label className="flex items-center gap-2">
            <span className="text-sm text-text-secondary">Enabled</span>
            <button
              onClick={handleToggleEnabled}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                config.enabled ? 'bg-primary' : 'bg-border-strong'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  config.enabled ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </label>
        )}
      </div>

      {/* Connection Config */}
      <div className="border-t border-border pt-4 space-y-4">
        <div>
          <label className="text-sm font-medium text-text-primary block mb-1">Database URL</label>
          {config?.databaseUrl && !showDbUrl ? (
            <div className="flex items-center gap-2">
              <span className="text-sm text-text-secondary font-mono">{config.databaseUrl}</span>
              <button
                onClick={() => setShowDbUrl(true)}
                className="text-xs text-primary hover:text-primary-hover"
              >
                Change
              </button>
            </div>
          ) : (
            <div className="flex gap-2">
              <input
                type="password"
                value={dbUrl}
                onChange={(e) => { setDbUrl(e.target.value); setTestResult(null); }}
                placeholder="postgresql://postgres.xxx:password@...pooler.supabase.com:6543/postgres"
                className="flex-1 px-3 py-2 border border-border rounded-lg bg-surface text-text-primary placeholder-text-tertiary text-sm font-mono"
              />
              <button
                onClick={handleSaveConfig}
                disabled={!dbUrl.trim()}
                className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary-hover text-sm disabled:opacity-50"
              >
                Save
              </button>
              {showDbUrl && (
                <button
                  onClick={() => { setShowDbUrl(false); setDbUrl(''); }}
                  className="px-3 py-2 text-text-secondary hover:bg-surface-secondary rounded-lg text-sm"
                >
                  Cancel
                </button>
              )}
            </div>
          )}
        </div>

        {/* Action Buttons */}
        {config?.databaseUrl && (
          <div className="flex flex-wrap gap-2">
            <button
              onClick={handleTestConnection}
              disabled={testing}
              className="flex items-center gap-2 px-3 py-2 border border-border rounded-lg text-sm text-text-primary hover:bg-surface-secondary disabled:opacity-50"
            >
              {testing ? <FaSpinner className="animate-spin" /> : <FaWifi />}
              Test Connection
            </button>
            <button
              onClick={handleSetupSchema}
              disabled={settingUpSchema}
              className="flex items-center gap-2 px-3 py-2 border border-border rounded-lg text-sm text-text-primary hover:bg-surface-secondary disabled:opacity-50"
            >
              {settingUpSchema ? <FaSpinner className="animate-spin" /> : <FaDatabase />}
              Setup Schema
            </button>
            {config.enabled && (
              <button
                onClick={handleSync}
                disabled={syncing}
                className="flex items-center gap-2 px-3 py-2 bg-primary text-white rounded-lg text-sm hover:bg-primary-hover disabled:opacity-50"
              >
                {syncing ? <FaSpinner className="animate-spin" /> : <FaSync />}
                Sync Now
              </button>
            )}
          </div>
        )}

        {/* Test Result */}
        {testResult && (
          <div className={`p-3 rounded-lg text-sm ${
            testResult.success
              ? 'bg-success-light border border-success text-success'
              : 'bg-danger-light border border-danger text-danger'
          }`}>
            {testResult.success ? <FaCheck className="inline mr-2" /> : <FaExclamationTriangle className="inline mr-2" />}
            {testResult.message}
          </div>
        )}
      </div>

      {/* Sync Status */}
      {status && config?.databaseUrl && (
        <div className="border-t border-border mt-4 pt-4">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-medium text-text-primary">Sync Status</h3>
            {getStateBadge(status.state)}
          </div>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-text-tertiary">Pending changes:</span>{' '}
              <span className="text-text-primary font-medium">{status.pendingCount}</span>
            </div>
            <div>
              <span className="text-text-tertiary">Last sync:</span>{' '}
              <span className="text-text-primary">
                {status.lastSyncAt ? new Date(status.lastSyncAt).toLocaleString() : 'Never'}
              </span>
            </div>
          </div>
          {status.lastError && (
            <div className="mt-2 p-2 bg-danger-light rounded text-danger text-xs">
              {status.lastError}
              <button
                onClick={() => { fetchStatus(); fetchConflicts(); }}
                className="ml-2 underline hover:no-underline"
              >
                Refresh
              </button>
            </div>
          )}
        </div>
      )}

      {/* Initial Sync */}
      {config?.databaseUrl && !config.enabled && (
        <div className="border-t border-border mt-4 pt-4">
          <h3 className="text-sm font-medium text-text-primary mb-2">Initial Sync</h3>
          <p className="text-sm text-text-secondary mb-3">
            First time connecting? Choose how to sync your data:
          </p>
          <div className="flex gap-2 mb-3">
            <button
              onClick={() => setInitialSyncDirection('push')}
              className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg border-2 text-sm transition-all ${
                initialSyncDirection === 'push'
                  ? 'border-primary bg-primary-light text-primary'
                  : 'border-border text-text-secondary hover:border-border-strong'
              }`}
            >
              <FaCloudUploadAlt /> Push Local
            </button>
            <button
              onClick={() => setInitialSyncDirection('pull')}
              className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg border-2 text-sm transition-all ${
                initialSyncDirection === 'pull'
                  ? 'border-primary bg-primary-light text-primary'
                  : 'border-border text-text-secondary hover:border-border-strong'
              }`}
            >
              <FaCloudDownloadAlt /> Pull Remote
            </button>
            <button
              onClick={() => setInitialSyncDirection('merge')}
              className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg border-2 text-sm transition-all ${
                initialSyncDirection === 'merge'
                  ? 'border-primary bg-primary-light text-primary'
                  : 'border-border text-text-secondary hover:border-border-strong'
              }`}
            >
              <FaExchangeAlt /> Merge
            </button>
          </div>
          <p className="text-xs text-text-tertiary mb-3">
            {initialSyncDirection === 'push' && 'Upload your local data to Supabase. Best when starting fresh on the cloud.'}
            {initialSyncDirection === 'pull' && 'Download cloud data to replace local. Best when setting up a new device.'}
            {initialSyncDirection === 'merge' && 'Combine both, keeping the most recent version of each record.'}
          </p>
          <button
            onClick={handleInitialSync}
            disabled={initialSyncing}
            className="w-full px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary-hover text-sm disabled:opacity-50"
          >
            {initialSyncing ? (
              <><FaSpinner className="inline animate-spin mr-2" /> Running initial sync...</>
            ) : (
              `Run Initial Sync (${initialSyncDirection})`
            )}
          </button>
        </div>
      )}

      {/* Conflicts */}
      {conflicts.length > 0 && (
        <div className="border-t border-border mt-4 pt-4">
          <h3 className="text-sm font-medium text-text-primary mb-2">
            Sync Conflicts ({conflicts.length})
          </h3>

          {/* Bulk action buttons when more than 5 conflicts */}
          {conflicts.length > 5 && (
            <div className="flex items-center gap-2 mb-3 p-3 bg-surface-secondary rounded-lg border border-border">
              <span className="text-xs text-text-secondary mr-1">Resolve all:</span>
              <button
                onClick={() => handleBulkResolve('keep-local')}
                disabled={bulkResolving}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-primary text-white rounded hover:bg-primary-hover disabled:opacity-50"
              >
                {bulkResolving ? <FaSpinner className="animate-spin" /> : null}
                Keep All Local
              </button>
              <button
                onClick={() => handleBulkResolve('use-remote')}
                disabled={bulkResolving}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-text-secondary text-white rounded hover:opacity-80 disabled:opacity-50"
              >
                {bulkResolving ? <FaSpinner className="animate-spin" /> : null}
                Use All Remote
              </button>
              <button
                onClick={() => handleBulkResolve('discard')}
                disabled={bulkResolving}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-danger border border-danger rounded hover:bg-danger-light disabled:opacity-50"
              >
                {bulkResolving ? <FaSpinner className="animate-spin" /> : null}
                Discard All
              </button>
            </div>
          )}

          <div className="space-y-2">
            {conflicts.map(conflict => {
              const isResolving = resolvingIds.has(conflict.changelogId);
              return (
                <div key={conflict.changelogId} className={`p-3 bg-surface-secondary rounded-lg border text-sm ${isResolving ? 'opacity-50' : ''}`}>
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-text-primary">
                      {conflict.table} / {conflict.recordId.slice(0, 8)}...
                    </span>
                    <div className="flex gap-1">
                      {isResolving ? (
                        <FaSpinner className="animate-spin text-text-tertiary" />
                      ) : (
                        <>
                          <button
                            onClick={() => handleResolveConflict(conflict.changelogId, 'keep-local')}
                            disabled={bulkResolving}
                            className="px-2 py-1 text-xs bg-primary text-white rounded hover:bg-primary-hover disabled:opacity-50"
                          >
                            Keep Local
                          </button>
                          <button
                            onClick={() => handleResolveConflict(conflict.changelogId, 'use-remote')}
                            disabled={bulkResolving}
                            className="px-2 py-1 text-xs bg-text-secondary text-white rounded hover:opacity-80 disabled:opacity-50"
                          >
                            Use Remote
                          </button>
                          <button
                            onClick={() => handleResolveConflict(conflict.changelogId, 'discard')}
                            disabled={bulkResolving}
                            className="px-2 py-1 text-xs text-danger border border-danger rounded hover:bg-danger-light disabled:opacity-50"
                          >
                            Discard
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
