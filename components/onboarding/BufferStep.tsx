'use client';

import { useState } from 'react';
import { formatCurrency } from '@/lib/formatCurrency';

interface BufferStepProps {
  budgetId: number | null;
  onNext: () => void;
  onBack: () => void;
}

export default function BufferStep({ budgetId, onNext, onBack }: BufferStepProps) {
  const [buffer, setBuffer] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const numericValue = parseFloat(buffer) || 0;

  const handleNext = async () => {
    if (numericValue < 0) {
      setError('Buffer cannot be negative');
      return;
    }

    if (!budgetId) {
      setError('Budget not found. Please try again.');
      return;
    }

    setSaving(true);
    try {
      const res = await fetch('/api/budgets', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: budgetId, buffer: numericValue }),
      });

      if (!res.ok) throw new Error('Failed to save buffer');

      await fetch('/api/onboarding', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ step: 4 }),
      });

      onNext();
    } catch {
      setError('Failed to save. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-lg mx-auto">
      <h2 className="text-2xl font-bold text-text-primary text-center mb-2">
        Set Your Starting Balance
      </h2>
      <p className="text-text-secondary text-center mb-8">
        How much money do you have right now? This becomes your buffer — the money you carry into this month.
      </p>

      <div className="bg-surface rounded-xl shadow-md p-8 mb-6">
        <label className="block text-sm font-medium text-text-secondary mb-2">
          Buffer Amount
        </label>
        <div className="relative">
          <span className="absolute left-4 top-1/2 -translate-y-1/2 text-2xl text-text-tertiary">$</span>
          <input
            type="number"
            value={buffer}
            onChange={(e) => { setBuffer(e.target.value); setError(''); }}
            placeholder="0.00"
            min="0"
            step="0.01"
            className="w-full pl-10 pr-4 py-4 text-2xl font-semibold border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent bg-surface text-text-primary"
          />
        </div>
        {error && <p className="text-danger text-sm mt-2">{error}</p>}
        {numericValue > 0 && (
          <p className="text-success text-sm mt-3">
            Your starting balance: ${formatCurrency(numericValue)}
          </p>
        )}
      </div>

      <p className="text-text-tertiary text-sm text-center mb-8">
        Don&apos;t worry, you can always change this later.
      </p>

      <div className="flex justify-between">
        <button
          onClick={onBack}
          className="border border-border-strong text-text-secondary px-6 py-3 rounded-lg hover:bg-surface-secondary transition-colors"
        >
          Back
        </button>
        <button
          onClick={handleNext}
          disabled={saving}
          className="bg-primary text-white px-8 py-3 rounded-lg font-semibold hover:bg-primary-hover transition-colors disabled:opacity-50"
        >
          {saving ? 'Saving...' : 'Next'}
        </button>
      </div>
    </div>
  );
}
