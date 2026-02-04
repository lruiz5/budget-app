'use client';

import { useState, useEffect, useCallback } from 'react';
import { FaDatabase, FaRedo, FaTrash, FaCloud, FaHistory, FaCheck, FaExclamationTriangle, FaSave } from 'react-icons/fa';

interface DbStatus {
  initialized: boolean;
  hasError: boolean;
  errorMessage: string | null;
  dbPath: string;
}

interface Backup {
  path: string;
  timestamp: string;
}

interface DbInfo {
  status: DbStatus;
  backups: Backup[];
  hasCloudConnection: boolean;
}

interface Props {
  onDatabaseChange?: () => void;
}

export default function DatabaseManagement({ onDatabaseChange }: Props) {
  const [dbInfo, setDbInfo] = useState<DbInfo | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [actionInProgress, setActionInProgress] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const fetchStatus = useCallback(async () => {
    try {
      const response = await fetch('/api/database');
      if (response.ok) {
        const data = await response.json();
        setDbInfo(data);
      }
    } catch (error) {
      console.error('Failed to fetch database status:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  const performAction = async (action: string, backupPath?: string) => {
    setActionInProgress(action);
    setMessage(null);

    try {
      const response = await fetch('/api/database', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, backupPath }),
      });

      const data = await response.json();

      if (data.success) {
        setMessage({ type: 'success', text: data.message });
        await fetchStatus();
        onDatabaseChange?.();
      } else {
        setMessage({ type: 'error', text: data.message });
      }
    } catch (error) {
      setMessage({
        type: 'error',
        text: error instanceof Error ? error.message : 'An error occurred',
      });
    } finally {
      setActionInProgress(null);
    }
  };

  const handleRetry = () => performAction('retry');
  const handleDelete = async () => {
    if (!confirm('This will delete your local database. A backup will be created first. Continue?')) {
      return;
    }
    await performAction('delete');
  };
  const handleRestore = (backupPath: string) => {
    if (!confirm('This will replace your current database with the backup. Continue?')) {
      return;
    }
    performAction('restore', backupPath);
  };
  const handleDeleteBackup = (backupPath: string) => {
    if (!confirm('Delete this backup? This cannot be undone.')) {
      return;
    }
    performAction('deleteBackup', backupPath);
  };
  const handleSyncFromCloud = async () => {
    if (!confirm('This will replace your local database with data from the cloud. Your current local data will be backed up first. Continue?')) {
      return;
    }
    await performAction('syncFromCloud');
  };

  const handleBackup = () => performAction('backup');

  const formatTimestamp = (timestamp: string) => {
    // Format: 2026-02-04T19-36-10-040Z -> local time string
    // Convert back to valid ISO: 2026-02-04T19:36:10.040Z
    try {
      const isoString = timestamp
        .replace(/T(\d{2})-(\d{2})-(\d{2})-(\d{3})Z?$/, 'T$1:$2:$3.$4Z');
      const date = new Date(isoString);
      if (isNaN(date.getTime())) {
        return timestamp;
      }
      return date.toLocaleString();
    } catch {
      return timestamp;
    }
  };

  if (isLoading) {
    return (
      <div className="bg-surface rounded-lg shadow p-6">
        <h2 className="text-xl font-semibold text-text-primary mb-4">Database</h2>
        <p className="text-text-secondary">Loading...</p>
      </div>
    );
  }

  if (!dbInfo) {
    return (
      <div className="bg-surface rounded-lg shadow p-6">
        <h2 className="text-xl font-semibold text-text-primary mb-4">Database</h2>
        <p className="text-danger">Failed to load database status</p>
      </div>
    );
  }

  const { status, backups, hasCloudConnection } = dbInfo;

  return (
    <div className="bg-surface rounded-lg shadow p-6">
      <div className="flex items-center gap-2 mb-4">
        <FaDatabase className="text-text-secondary" />
        <h2 className="text-xl font-semibold text-text-primary">Database</h2>
      </div>

      {/* Status Message */}
      {message && (
        <div
          className={`mb-4 p-3 rounded-lg flex items-center gap-2 ${
            message.type === 'success'
              ? 'bg-success-light text-success border border-success'
              : 'bg-danger-light text-danger border border-danger'
          }`}
        >
          {message.type === 'success' ? <FaCheck /> : <FaExclamationTriangle />}
          <span>{message.text}</span>
        </div>
      )}

      {/* Database Status */}
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-2">
          <span
            className={`w-3 h-3 rounded-full ${
              status.initialized && !status.hasError ? 'bg-success' : 'bg-danger'
            }`}
          />
          <span className="font-medium text-text-primary">
            {status.initialized && !status.hasError ? 'Healthy' : 'Error'}
          </span>
        </div>
        <p className="text-sm text-text-tertiary">Location: {status.dbPath}</p>

        {status.hasError && status.errorMessage && (
          <div className="mt-3 p-4 bg-danger-light border border-danger rounded-lg">
            <p className="text-sm text-danger whitespace-pre-wrap">{status.errorMessage}</p>
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="space-y-3 mb-6">
        {status.hasError && (
          <button
            onClick={handleRetry}
            disabled={actionInProgress !== null}
            className="flex items-center gap-2 w-full px-4 py-3 bg-primary text-white rounded-lg hover:bg-primary-hover disabled:opacity-50"
          >
            <FaRedo className={actionInProgress === 'retry' ? 'animate-spin' : ''} />
            {actionInProgress === 'retry' ? 'Retrying...' : 'Retry Connection'}
          </button>
        )}

        {status.initialized && !status.hasError && (
          <button
            onClick={handleBackup}
            disabled={actionInProgress !== null}
            className="flex items-center gap-2 w-full px-4 py-3 bg-primary text-white rounded-lg hover:bg-primary-hover disabled:opacity-50"
          >
            <FaSave className={actionInProgress === 'backup' ? 'animate-spin' : ''} />
            {actionInProgress === 'backup' ? 'Creating Backup...' : 'Create Backup'}
          </button>
        )}

        {hasCloudConnection && (
          <button
            onClick={handleSyncFromCloud}
            disabled={actionInProgress !== null}
            className="flex items-center gap-2 w-full px-4 py-3 bg-surface-secondary border border-border text-text-primary rounded-lg hover:bg-surface-tertiary disabled:opacity-50"
          >
            <FaCloud className={actionInProgress === 'syncFromCloud' ? 'animate-spin' : ''} />
            {actionInProgress === 'syncFromCloud' ? 'Syncing...' : 'Restore from Cloud'}
          </button>
        )}

        <button
          onClick={handleDelete}
          disabled={actionInProgress !== null}
          className="flex items-center gap-2 w-full px-4 py-3 bg-surface-secondary border border-border text-danger rounded-lg hover:bg-danger-light disabled:opacity-50"
        >
          <FaTrash />
          {actionInProgress === 'delete' ? 'Deleting...' : 'Delete Local Database'}
        </button>
      </div>

      {/* Backups */}
      {backups.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <FaHistory className="text-text-secondary" />
            <h3 className="font-medium text-text-primary">Backups</h3>
          </div>
          <div className="space-y-2">
            {backups.map((backup) => (
              <div
                key={backup.path}
                className="flex items-center justify-between p-3 bg-surface-secondary rounded-lg"
              >
                <span className="text-sm text-text-secondary">
                  {formatTimestamp(backup.timestamp)}
                </span>
                <div className="flex gap-2">
                  <button
                    onClick={() => handleRestore(backup.path)}
                    disabled={actionInProgress !== null}
                    className="text-sm px-3 py-1 text-primary hover:bg-primary-light rounded disabled:opacity-50"
                  >
                    Restore
                  </button>
                  <button
                    onClick={() => handleDeleteBackup(backup.path)}
                    disabled={actionInProgress !== null}
                    className="text-sm px-3 py-1 text-danger hover:bg-danger-light rounded disabled:opacity-50"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Help Text */}
      <div className="mt-6 p-4 bg-surface-secondary rounded-lg text-sm text-text-secondary">
        <p className="font-medium mb-2">About Local Database</p>
        <ul className="list-disc list-inside space-y-1">
          <li>Your data is stored locally on this device</li>
          <li>Backups are created automatically before destructive operations</li>
          {hasCloudConnection ? (
            <li className="text-success">Cloud sync is available - use &quot;Restore from Cloud&quot; to recover data</li>
          ) : (
            <li>Set DATABASE_URL in .env to enable cloud backup</li>
          )}
        </ul>
      </div>
    </div>
  );
}
