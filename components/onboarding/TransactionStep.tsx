'use client';

import { useState } from 'react';
import { formatCurrency } from '@/lib/formatCurrency';

interface SuggestedTransaction {
  description: string;
  amount: number;
  type: 'expense' | 'income';
  itemName: string;
}

const suggestedTransactions: Record<string, SuggestedTransaction[]> = {
  'Groceries': [{ description: 'Weekly groceries', amount: 85.50, type: 'expense', itemName: 'Groceries' }],
  'Restaurant': [{ description: 'Lunch out', amount: 15.00, type: 'expense', itemName: 'Restaurant' }],
  'Gas': [{ description: 'Gas fill-up', amount: 45.00, type: 'expense', itemName: 'Gas' }],
  'Spending Money': [{ description: 'Coffee shop', amount: 6.50, type: 'expense', itemName: 'Spending Money' }],
};

interface CreatedItem {
  id: number;
  categoryName: string;
  name: string;
  planned: number;
}

interface TransactionStepProps {
  createdItems: CreatedItem[];
  onNext: () => void;
  onBack: () => void;
}

export default function TransactionStep({ createdItems, onNext, onBack }: TransactionStepProps) {
  const [type, setType] = useState<'expense' | 'income'>('expense');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [description, setDescription] = useState('');
  const [budgetItemId, setBudgetItemId] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async () => {
    const numAmount = parseFloat(amount) || 0;
    if (numAmount <= 0) { setError('Enter an amount'); return; }
    if (!description.trim()) { setError('Enter a description'); return; }
    if (!budgetItemId) { setError('Select a budget item'); return; }

    setSaving(true);
    setError('');
    try {
      const res = await fetch('/api/transactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          budgetItemId: parseInt(budgetItemId),
          date,
          description: description.trim(),
          amount: numAmount,
          type,
        }),
      });

      if (!res.ok) throw new Error('Failed to create transaction');

      await fetch('/api/onboarding', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ step: 6 }),
      });

      onNext();
    } catch {
      setError('Failed to save. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleSkip = async () => {
    await fetch('/api/onboarding', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ step: 6 }),
    });
    onNext();
  };

  return (
    <div className="max-w-lg mx-auto">
      <h2 className="text-2xl font-bold text-text-primary text-center mb-2">
        Add Your First Transaction
      </h2>
      <p className="text-text-secondary text-center mb-8">
        Think of a recent purchase or expense to get started.
      </p>

      {/* Suggested transactions */}
      {(() => {
        const suggestions = createdItems.flatMap(item =>
          (suggestedTransactions[item.name] || []).map(s => ({ ...s, itemId: item.id }))
        );
        if (suggestions.length === 0) return null;
        return (
          <div className="mb-6">
            <p className="text-xs text-text-tertiary mb-2">Quick fill — click to populate:</p>
            <div className="flex flex-wrap gap-2">
              {suggestions.map((s) => (
                <button
                  key={s.description}
                  onClick={() => {
                    setDescription(s.description);
                    setAmount(s.amount.toString());
                    setType(s.type);
                    setBudgetItemId(s.itemId.toString());
                    setError('');
                  }}
                  className="text-xs border border-primary/30 text-primary bg-primary/5 px-3 py-1.5 rounded-full hover:bg-primary/10 transition-colors"
                >
                  {s.description} · ${formatCurrency(s.amount)}
                </button>
              ))}
            </div>
          </div>
        );
      })()}

      <div className="bg-surface rounded-xl shadow-md p-6 space-y-5 mb-6">
        {/* Type toggle */}
        <div>
          <label className="block text-sm font-medium text-text-secondary mb-2">Type</label>
          <div className="flex gap-2">
            <button
              onClick={() => setType('expense')}
              className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
                type === 'expense'
                  ? 'bg-danger text-white'
                  : 'border border-border text-text-secondary hover:bg-surface-secondary'
              }`}
            >
              Expense
            </button>
            <button
              onClick={() => setType('income')}
              className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
                type === 'income'
                  ? 'bg-success text-white'
                  : 'border border-border text-text-secondary hover:bg-surface-secondary'
              }`}
            >
              Income
            </button>
          </div>
        </div>

        {/* Amount */}
        <div>
          <label className="block text-sm font-medium text-text-secondary mb-2">Amount</label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary">$</span>
            <input
              type="number"
              value={amount}
              onChange={(e) => { setAmount(e.target.value); setError(''); }}
              placeholder="0.00"
              min="0"
              step="0.01"
              className="w-full pl-7 pr-3 py-2.5 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent bg-surface text-text-primary"
            />
          </div>
        </div>

        {/* Date */}
        <div>
          <label className="block text-sm font-medium text-text-secondary mb-2">Date</label>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="w-full px-3 py-2.5 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent bg-surface text-text-primary"
          />
        </div>

        {/* Description */}
        <div>
          <label className="block text-sm font-medium text-text-secondary mb-2">Description</label>
          <input
            type="text"
            value={description}
            onChange={(e) => { setDescription(e.target.value); setError(''); }}
            placeholder="e.g., Grocery store, Gas station"
            className="w-full px-3 py-2.5 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent bg-surface text-text-primary"
          />
        </div>

        {/* Budget item selector */}
        <div>
          <label className="block text-sm font-medium text-text-secondary mb-2">Assign to</label>
          <select
            value={budgetItemId}
            onChange={(e) => { setBudgetItemId(e.target.value); setError(''); }}
            className="w-full px-3 py-2.5 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent bg-surface text-text-primary"
          >
            <option value="">Select a budget item...</option>
            {createdItems.map((item) => (
              <option key={item.id} value={item.id}>
                {item.categoryName} → {item.name}
              </option>
            ))}
          </select>
        </div>

        {error && <p className="text-danger text-sm">{error}</p>}
      </div>

      <div className="flex justify-between items-center">
        <button
          onClick={onBack}
          className="border border-border-strong text-text-secondary px-6 py-3 rounded-lg hover:bg-surface-secondary transition-colors"
        >
          Back
        </button>
        <div className="flex gap-3">
          <button
            onClick={handleSkip}
            className="text-text-tertiary hover:text-text-secondary px-4 py-3 transition-colors"
          >
            Skip
          </button>
          <button
            onClick={handleSubmit}
            disabled={saving}
            className="bg-primary text-white px-8 py-3 rounded-lg font-semibold hover:bg-primary-hover transition-colors disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Add Transaction'}
          </button>
        </div>
      </div>
    </div>
  );
}
