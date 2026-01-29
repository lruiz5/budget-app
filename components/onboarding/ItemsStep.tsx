'use client';

import { useState } from 'react';
import { formatCurrency } from '@/lib/formatCurrency';

interface CreatedItem {
  id: number;
  categoryName: string;
  name: string;
  planned: number;
}

interface CategoryInfo {
  id: number;
  type: string;
  name: string;
  emoji: string;
}

interface ItemsStepProps {
  categories: CategoryInfo[];
  onNext: () => void;
  onBack: () => void;
  createdItems: CreatedItem[];
  setCreatedItems: React.Dispatch<React.SetStateAction<CreatedItem[]>>;
}

interface SuggestedItem {
  name: string;
  planned: number;
}

const suggestedItems: Record<string, SuggestedItem[]> = {
  giving: [{ name: 'Charity', planned: 25 }],
  household: [
    { name: 'Rent', planned: 1200 },
    { name: 'Utilities', planned: 250 },
    { name: 'Hygiene/Toiletries', planned: 100 },
  ],
  transportation: [
    { name: 'Maintenance', planned: 150 },
    { name: 'Gas', planned: 150 },
  ],
  food: [
    { name: 'Groceries', planned: 400 },
    { name: 'Restaurant', planned: 100 },
  ],
  personal: [{ name: 'Spending Money', planned: 100 }],
  insurance: [{ name: 'Auto Insurance', planned: 200 }],
  saving: [{ name: 'Emergency Fund', planned: 500 }],
};

const emojiMap: Record<string, string> = {
  'income': '💰',
  'giving': '🤲',
  'household': '🏠',
  'transportation': '🚗',
  'food': '🍽️',
  'personal': '👤',
  'insurance': '🛡️',
  'saving': '💵',
};

export default function ItemsStep({ categories, onNext, onBack, createdItems, setCreatedItems }: ItemsStepProps) {
  const [expandedCategory, setExpandedCategory] = useState<string | null>(null);
  const [itemName, setItemName] = useState('');
  const [itemPlanned, setItemPlanned] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const total = createdItems.reduce((sum, item) => sum + item.planned, 0);

  const handleAddItem = async (categoryId: number, categoryName: string) => {
    if (!itemName.trim()) {
      setError('Please enter a name');
      return;
    }
    const planned = parseFloat(itemPlanned) || 0;
    if (planned <= 0) {
      setError('Please enter an amount greater than $0');
      return;
    }

    setSaving(true);
    setError('');
    try {
      const res = await fetch('/api/budget-items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ categoryId, name: itemName.trim(), planned }),
      });

      if (!res.ok) throw new Error('Failed to create item');
      const data = await res.json();

      setCreatedItems(prev => [...prev, {
        id: data.id,
        categoryName,
        name: itemName.trim(),
        planned,
      }]);
      setItemName('');
      setItemPlanned('');
    } catch {
      setError('Failed to add item. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleNext = async () => {
    await fetch('/api/onboarding', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ step: 5 }),
    });
    onNext();
  };

  // Filter out income category for onboarding simplicity
  const expenseCategories = categories.filter(c => c.type !== 'income');

  return (
    <div className="max-w-2xl mx-auto">
      <h2 className="text-2xl font-bold text-text-primary text-center mb-2">
        Create Budget Items
      </h2>
      <p className="text-text-secondary text-center mb-6">
        Add items to your budget categories. Think about your regular expenses like rent, groceries, or gas.
      </p>

      {createdItems.length > 0 && (
        <div className="bg-primary/10 rounded-lg px-4 py-3 mb-6 flex justify-between items-center">
          <span className="text-text-secondary font-medium">{createdItems.length} item{createdItems.length !== 1 ? 's' : ''} added</span>
          <span className="text-primary font-semibold">Total: ${formatCurrency(total)}</span>
        </div>
      )}

      <div className="space-y-3 mb-6">
        {expenseCategories.map((cat) => {
          const isExpanded = expandedCategory === cat.type;
          const categoryItems = createdItems.filter(item => item.categoryName === cat.name);

          return (
            <div key={cat.type} className="bg-surface rounded-xl shadow-md overflow-hidden">
              <button
                onClick={() => {
                  setExpandedCategory(isExpanded ? null : cat.type);
                  setItemName('');
                  setItemPlanned('');
                  setError('');
                }}
                className="w-full px-5 py-4 flex items-center justify-between hover:bg-surface-secondary transition-colors"
              >
                <div className="flex items-center gap-3">
                  <span className="text-xl">{emojiMap[cat.type] || '📋'}</span>
                  <span className="font-semibold text-text-primary">{cat.name}</span>
                  {categoryItems.length > 0 && (
                    <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full">
                      {categoryItems.length}
                    </span>
                  )}
                </div>
                <span className="text-text-tertiary text-sm">
                  {isExpanded ? '▲' : '▼'}
                </span>
              </button>

              {isExpanded && (
                <div className="px-5 pb-5 border-t border-border">
                  {categoryItems.length > 0 && (
                    <div className="mt-3 mb-4 space-y-1">
                      {categoryItems.map((item) => (
                        <div key={item.id} className="flex justify-between text-sm text-text-secondary py-1">
                          <span>{item.name}</span>
                          <span>${formatCurrency(item.planned)}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Suggested items */}
                  {(suggestedItems[cat.type] || []).filter(
                    s => !categoryItems.some(ci => ci.name.toLowerCase() === s.name.toLowerCase())
                  ).length > 0 && (
                    <div className="mt-3 mb-3">
                      <p className="text-xs text-text-tertiary mb-2">Suggested items — click to add:</p>
                      <div className="flex flex-wrap gap-2">
                        {(suggestedItems[cat.type] || [])
                          .filter(s => !categoryItems.some(ci => ci.name.toLowerCase() === s.name.toLowerCase()))
                          .map((s) => (
                            <button
                              key={s.name}
                              onClick={() => {
                                setItemName(s.name);
                                setItemPlanned(s.planned.toString());
                              }}
                              className="text-xs border border-primary/30 text-primary bg-primary/5 px-3 py-1.5 rounded-full hover:bg-primary/10 transition-colors"
                            >
                              {s.name} · ${formatCurrency(s.planned)}
                            </button>
                          ))}
                      </div>
                    </div>
                  )}

                  <div className="mt-3 space-y-3">
                    <input
                      type="text"
                      value={itemName}
                      onChange={(e) => { setItemName(e.target.value); setError(''); }}
                      placeholder="Item name (e.g., Rent, Groceries)"
                      className="w-full px-3 py-2 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent bg-surface text-text-primary text-sm"
                    />
                    <div className="flex gap-3">
                      <div className="relative flex-1">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary text-sm">$</span>
                        <input
                          type="number"
                          value={itemPlanned}
                          onChange={(e) => { setItemPlanned(e.target.value); setError(''); }}
                          placeholder="0.00"
                          min="0"
                          step="0.01"
                          className="w-full pl-7 pr-3 py-2 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent bg-surface text-text-primary text-sm"
                        />
                      </div>
                      <button
                        onClick={() => handleAddItem(cat.id, cat.name)}
                        disabled={saving}
                        className="bg-primary text-white px-5 py-2 rounded-lg text-sm font-medium hover:bg-primary-hover transition-colors disabled:opacity-50"
                      >
                        {saving ? '...' : 'Add'}
                      </button>
                    </div>
                    {error && <p className="text-danger text-xs">{error}</p>}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {createdItems.length === 0 && (
        <p className="text-text-tertiary text-sm text-center mb-6">
          Click a category above to add your first budget item.
        </p>
      )}

      <div className="flex justify-between">
        <button
          onClick={onBack}
          className="border border-border-strong text-text-secondary px-6 py-3 rounded-lg hover:bg-surface-secondary transition-colors"
        >
          Back
        </button>
        <button
          onClick={handleNext}
          disabled={createdItems.length === 0}
          className="bg-primary text-white px-8 py-3 rounded-lg font-semibold hover:bg-primary-hover transition-colors disabled:opacity-50"
        >
          Continue
        </button>
      </div>
    </div>
  );
}
