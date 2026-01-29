'use client';

import { useState, useEffect } from 'react';
import { BudgetItem } from '@/types/budget';
import { FaPlus, FaTimes } from 'react-icons/fa';
import { useToast } from '@/contexts/ToastContext';
import { formatCurrency } from '@/lib/formatCurrency';

interface SplitItem {
  budgetItemId: string;
  amount: string;
  description: string;
}

export interface ExistingSplit {
  id: number;
  budgetItemId: number;
  amount: number;
  description?: string | null;
}

interface SplitTransactionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSplit: (splits: { budgetItemId: number; amount: number; description?: string }[]) => void;
  transactionId: number;
  transactionAmount: number;
  transactionDescription: string;
  budgetItems: { category: string; items: BudgetItem[] }[];
  existingSplits?: ExistingSplit[];
}

export default function SplitTransactionModal({
  isOpen,
  onClose,
  onSplit,
  transactionId,
  transactionAmount,
  transactionDescription,
  budgetItems,
  existingSplits,
}: SplitTransactionModalProps) {
  const toast = useToast();
  const [splits, setSplits] = useState<SplitItem[]>([
    { budgetItemId: '', amount: '', description: '' },
    { budgetItemId: '', amount: '', description: '' },
  ]);

  const isEditMode = existingSplits && existingSplits.length > 0;

  // Populate form when modal opens
  useEffect(() => {
    if (isOpen) {
      if (existingSplits && existingSplits.length > 0) {
        // Pre-populate with existing splits
        setSplits(existingSplits.map(s => ({
          budgetItemId: s.budgetItemId.toString(),
          amount: s.amount.toFixed(2),
          description: s.description || '',
        })));
      } else {
        // Reset to empty for new split
        setSplits([
          { budgetItemId: '', amount: '', description: '' },
          { budgetItemId: '', amount: '', description: '' },
        ]);
      }
    }
  }, [isOpen, existingSplits]);

  const addSplit = () => {
    setSplits([...splits, { budgetItemId: '', amount: '', description: '' }]);
  };

  const removeSplit = (index: number) => {
    if (splits.length > 2) {
      setSplits(splits.filter((_, i) => i !== index));
    }
  };

  const updateSplit = (index: number, field: keyof SplitItem, value: string) => {
    const newSplits = [...splits];
    newSplits[index] = { ...newSplits[index], [field]: value };
    setSplits(newSplits);
  };

  const calculateRemaining = () => {
    const total = splits.reduce((sum, s) => sum + (parseFloat(s.amount) || 0), 0);
    return transactionAmount - total;
  };

  const applyRemainder = (index: number) => {
    const remaining = calculateRemaining();
    if (remaining > 0) {
      const currentAmount = parseFloat(splits[index].amount) || 0;
      updateSplit(index, 'amount', (currentAmount + remaining).toFixed(2));
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    // Filter out empty splits and validate
    const validSplits = splits.filter(s => s.budgetItemId && parseFloat(s.amount) > 0);

    if (validSplits.length < 2) {
      toast.warning('Please add at least 2 splits with amounts');
      return;
    }

    const remaining = calculateRemaining();
    if (Math.abs(remaining) > 0.01) {
      toast.warning(`Split amounts must equal the transaction amount. Remaining: $${formatCurrency(remaining)}`);
      return;
    }

    onSplit(
      validSplits.map(s => ({
        budgetItemId: parseInt(s.budgetItemId),
        amount: parseFloat(s.amount),
        description: s.description || undefined,
      }))
    );
  };

  if (!isOpen) return null;

  const remaining = calculateRemaining();
  const isBalanced = Math.abs(remaining) < 0.01;

  return (
    <div className="fixed inset-0 bg-black/15 flex items-center justify-center z-50">
      <div className="bg-surface rounded-lg p-6 max-w-lg w-full mx-4 shadow-xl max-h-[90vh] overflow-y-auto">
        <h2 className="text-2xl font-bold text-text-primary mb-2">
          {isEditMode ? 'Edit Split' : 'Split Transaction'}
        </h2>
        <p className="text-text-secondary mb-4">{transactionDescription}</p>
        <div className="bg-surface-secondary rounded-lg p-3 mb-6">
          <div className="flex justify-between items-center">
            <span className="text-text-secondary">Total Amount:</span>
            <span className="text-xl font-bold text-text-primary">${formatCurrency(transactionAmount)}</span>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {splits.map((split, index) => (
            <div key={index} className="border border-border rounded-lg p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-text-secondary">Split {index + 1}</span>
                {splits.length > 2 && (
                  <button
                    type="button"
                    onClick={() => removeSplit(index)}
                    className="text-danger hover:text-danger"
                  >
                    <FaTimes size={14} />
                  </button>
                )}
              </div>

              {/* Budget Item */}
              <select
                value={split.budgetItemId}
                onChange={(e) => updateSplit(index, 'budgetItemId', e.target.value)}
                className="w-full px-3 py-2 border border-border-strong rounded focus:outline-none focus:ring-2 focus:ring-primary bg-surface text-sm"
                required
              >
                <option value="">Select budget item...</option>
                {budgetItems.map((group) => (
                  <optgroup key={group.category} label={group.category}>
                    {group.items.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>

              {/* Amount */}
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <span className="absolute left-3 top-2 text-text-secondary">$</span>
                  <input
                    type="number"
                    value={split.amount}
                    onChange={(e) => updateSplit(index, 'amount', e.target.value)}
                    onFocus={(e) => e.target.select()}
                    placeholder="0.00"
                    step="0.01"
                    min="0"
                    className="w-full pl-7 pr-3 py-2 border border-border-strong rounded focus:outline-none focus:ring-2 focus:ring-primary text-sm [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                    required
                  />
                </div>
                {remaining > 0.01 && (
                  <button
                    type="button"
                    onClick={() => applyRemainder(index)}
                    className="px-3 py-2 text-xs bg-surface-secondary hover:bg-surface-secondary text-text-secondary rounded whitespace-nowrap"
                  >
                    + Remainder
                  </button>
                )}
              </div>

              {/* Description (optional) */}
              <input
                type="text"
                value={split.description}
                onChange={(e) => updateSplit(index, 'description', e.target.value)}
                placeholder="Description (optional)"
                className="w-full px-3 py-2 border border-border-strong rounded focus:outline-none focus:ring-2 focus:ring-primary text-sm"
              />
            </div>
          ))}

          {/* Add split button */}
          <button
            type="button"
            onClick={addSplit}
            className="w-full py-2 border-2 border-dashed border-border-strong rounded-lg text-text-secondary hover:border-text-tertiary hover:text-text-secondary flex items-center justify-center gap-2"
          >
            <FaPlus size={12} />
            Add Another Split
          </button>

          {/* Remaining indicator */}
          <div className={`p-3 rounded-lg ${isBalanced ? 'bg-success-light' : 'bg-warning-light'}`}>
            <div className="flex justify-between items-center">
              <span className={isBalanced ? 'text-success' : 'text-warning'}>
                {isBalanced ? 'Balanced!' : 'Remaining:'}
              </span>
              <span className={`font-bold ${isBalanced ? 'text-success' : 'text-warning'}`}>
                ${formatCurrency(remaining)}
              </span>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex gap-3 mt-6">
            <button
              type="submit"
              disabled={!isBalanced}
              className="flex-1 px-4 py-2 bg-primary text-white rounded hover:bg-primary-hover font-medium disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isEditMode ? 'Update Split' : 'Split Transaction'}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 bg-border-strong text-text-secondary rounded hover:bg-border-strong font-medium"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
