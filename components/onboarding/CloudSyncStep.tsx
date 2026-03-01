'use client';

import { useState } from 'react';
import { api } from '@/lib/api-client';

type Phase = 'idle' | 'connecting' | 'testing' | 'schema' | 'syncing' | 'done' | 'error';

interface CloudSyncStepProps {
  onNext: () => void;
  onSynced: () => void;
}

const PHASE_LABELS: Record<Phase, string> = {
  idle: '',
  connecting: 'Saving connection...',
  testing: 'Testing connection...',
  schema: 'Setting up schema...',
  syncing: 'Pulling data from cloud...',
  done: 'Sync complete!',
  error: '',
};

export default function CloudSyncStep({ onNext, onSynced }: CloudSyncStepProps) {
  const [connectionString, setConnectionString] = useState('');
  const [phase, setPhase] = useState<Phase>('idle');
  const [errorMessage, setErrorMessage] = useState('');
  const [syncStats, setSyncStats] = useState<{ pushed: number; pulled: number; errors: number } | null>(null);

  const isProcessing = phase !== 'idle' && phase !== 'done' && phase !== 'error';

  const handleConnect = async () => {
    if (!connectionString.trim()) return;

    setErrorMessage('');
    setSyncStats(null);

    try {
      // Step 1: Save config
      setPhase('connecting');
      await api.supabase.updateConfig({ databaseUrl: connectionString.trim() });

      // Step 2: Test connection
      setPhase('testing');
      const testResult = await api.supabase.testConnection();
      if (!testResult.success) {
        setPhase('error');
        setErrorMessage(testResult.message || 'Connection test failed');
        return;
      }

      // Step 3: Setup schema
      setPhase('schema');
      const schemaResult = await api.supabase.setupSchema();
      if (!schemaResult.success) {
        setPhase('error');
        setErrorMessage(schemaResult.message || 'Schema setup failed');
        return;
      }

      // Step 4: Initial pull
      setPhase('syncing');
      const syncResult = await api.supabase.initialSync('pull');
      if (!syncResult.success) {
        setPhase('error');
        setErrorMessage(syncResult.error || syncResult.message || 'Sync failed');
        return;
      }

      setSyncStats(syncResult.stats || { pushed: 0, pulled: 0, errors: 0 });

      if (syncResult.stats?.errors && syncResult.stats.errors > 0) {
        setPhase('error');
        setErrorMessage(`Sync completed with ${syncResult.stats.errors} error(s). ${syncResult.stats.pulled} records pulled.`);
      } else {
        setPhase('done');
        // Mark onboarding complete and go to dashboard after a brief delay
        await api.onboarding.finish('complete');
        setTimeout(() => onSynced(), 1500);
      }
    } catch (err) {
      setPhase('error');
      setErrorMessage(err instanceof Error ? err.message : 'An unexpected error occurred');
    }
  };

  return (
    <div className="text-center max-w-lg mx-auto">
      <div className="text-6xl mb-6">☁️</div>
      <h1 className="text-3xl font-bold text-text-primary mb-4">
        Do you have a cloud database?
      </h1>
      <p className="text-text-secondary mb-2">
        If you&apos;ve used Budget App on another device, enter your Supabase connection string to pull in your existing data.
      </p>
      <p className="text-text-tertiary text-sm mb-8">
        This will sync all your budgets, transactions, and settings from the cloud.
      </p>

      {/* Connection input */}
      <div className="text-left mb-6">
        <label htmlFor="connection-string" className="block text-sm font-medium text-text-secondary mb-2">
          PostgreSQL Connection String
        </label>
        <input
          id="connection-string"
          type="password"
          value={connectionString}
          onChange={(e) => setConnectionString(e.target.value)}
          placeholder="postgresql://postgres.xxx:password@..."
          disabled={isProcessing || phase === 'done'}
          className="w-full px-4 py-3 rounded-lg border border-border bg-surface-primary text-text-primary placeholder:text-text-tertiary focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent disabled:opacity-50"
        />
      </div>

      {/* Progress indicator */}
      {isProcessing && (
        <div className="flex items-center justify-center gap-3 mb-6 text-primary">
          <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          <span className="font-medium">{PHASE_LABELS[phase]}</span>
        </div>
      )}

      {/* Success message */}
      {phase === 'done' && syncStats && (
        <div className="mb-6 p-4 bg-success-light rounded-lg text-success">
          <div className="font-semibold mb-1">Data synced successfully!</div>
          <div className="text-sm">
            Pulled {syncStats.pulled} records from cloud. Redirecting to dashboard...
          </div>
        </div>
      )}

      {/* Error message */}
      {phase === 'error' && errorMessage && (
        <div className="mb-6 p-4 bg-danger-light rounded-lg text-danger text-sm">
          {errorMessage}
        </div>
      )}

      {/* Action buttons */}
      <button
        onClick={handleConnect}
        disabled={!connectionString.trim() || isProcessing || phase === 'done'}
        className="w-full bg-primary text-white px-10 py-3 rounded-lg text-lg font-semibold hover:bg-primary-hover transition-colors disabled:opacity-50 mb-4"
      >
        {phase === 'error' ? 'Try Again' : 'Connect & Sync'}
      </button>

      {/* Go to dashboard after error with partial success */}
      {phase === 'error' && syncStats && syncStats.pulled > 0 && (
        <button
          onClick={async () => {
            await api.onboarding.finish('complete');
            onSynced();
          }}
          className="w-full border border-primary text-primary px-8 py-3 rounded-lg text-sm font-medium hover:bg-primary hover:text-white transition-colors mb-4"
        >
          Continue to Dashboard ({syncStats.pulled} records synced)
        </button>
      )}

      <div className="flex items-center gap-3 my-4">
        <div className="flex-1 h-px bg-border" />
        <span className="text-text-tertiary text-sm">or</span>
        <div className="flex-1 h-px bg-border" />
      </div>

      <button
        onClick={onNext}
        disabled={isProcessing}
        className="text-text-secondary hover:text-text-primary transition-colors text-sm font-medium disabled:opacity-50"
      >
        I don&apos;t have one — set up a fresh budget
      </button>
    </div>
  );
}
