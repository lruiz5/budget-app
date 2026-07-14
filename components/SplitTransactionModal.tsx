'use client';

import { useState, useEffect } from 'react';
import { BudgetItem } from '@/types/budget';
import { Plus, X } from "lucide-react";
import { useToast } from '@/contexts/ToastContext';
import { formatCurrency } from '@/lib/formatCurrency';
import Modal from '@/components/ui/Modal';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Select from '@/components/ui/Select';
import CurrencyInput from '@/components/ui/CurrencyInput';

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
  isNonEarned?: boolean;
}

interface SplitTransactionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSplit: (splits: { budgetItemId: number; amount: number; description?: string; isNonEarned?: boolean }[]) => void;
  onUnsplit?: () => void;
  transactionId: number;
  transactionAmount: number;
  transactionDescription: string;
  transactionType?: 'income' | 'expense';
  budgetItems: { category: string; items: BudgetItem[] }[];
  existingSplits?: ExistingSplit[];
}

export default function SplitTransactionModal({
  isOpen,
  onClose,
  onSplit,
  onUnsplit,
  transactionId,
  transactionAmount,
  transactionDescription,
  transactionType,
  budgetItems,
  existingSplits,
}: SplitTransactionModalProps) {
  const toast = useToast();
  const [splits, setSplits] = useState<SplitItem[]>([
    { budgetItemId: '', amount: '', description: '' },
    { budgetItemId: '', amount: '', description: '' },
  ]);

  const [isNonEarned, setIsNonEarned] = useState(false);
  const [showUnsplitConfirm, setShowUnsplitConfirm] = useState(false);
  const isEditMode = existingSplits && existingSplits.length > 0;

  // Populate form when modal opens
  useEffect(() => {
    setShowUnsplitConfirm(false);
    if (isOpen) {
      if (existingSplits && existingSplits.length > 0) {
        // Pre-populate with existing splits
        setSplits(existingSplits.map(s => ({
          budgetItemId: s.budgetItemId.toString(),
          amount: parseFloat(String(s.amount)).toFixed(2),
          description: s.description || '',
        })));
        setIsNonEarned(existingSplits.some(s => s.isNonEarned));
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
        isNonEarned: transactionType === 'income' ? isNonEarned : undefined,
      }))
    );
  };

  if (!isOpen) return null;

  const remaining = calculateRemaining();
  const isBalanced = Math.abs(remaining) < 0.01;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={isEditMode ? 'Edit Split' : 'Split Transaction'}
      size="lg"
    >
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
                    <X size={14} />
                  </button>
                )}
              </div>

              {/* Budget Item */}
              <Select
                value={split.budgetItemId}
                onChange={(e) => updateSplit(index, 'budgetItemId', e.target.value)}
                className="text-sm"
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
              </Select>

              {/* Amount */}
              <div className="flex gap-2">
                <CurrencyInput
                  wrapperClassName="flex-1"
                  value={split.amount}
                  onChange={(e) => updateSplit(index, 'amount', e.target.value)}
                  placeholder="0.00"
                  min="0"
                  className="text-sm"
                  required
                />
                {remaining > 0.01 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => applyRemainder(index)}
                    className="whitespace-nowrap text-xs bg-surface-secondary"
                  >
                    + Remainder
                  </Button>
                )}
              </div>

              {/* Description (optional) */}
              <Input
                type="text"
                value={split.description}
                onChange={(e) => updateSplit(index, 'description', e.target.value)}
                placeholder="Description (optional)"
                className="text-sm"
              />
            </div>
          ))}

          {/* Add split button */}
          <button
            type="button"
            onClick={addSplit}
            className="w-full py-2 border-2 border-dashed border-border-strong rounded-lg text-text-secondary hover:border-text-tertiary hover:text-text-secondary flex items-center justify-center gap-2"
          >
            <Plus size={12} />
            Add Another Split
          </button>

          {/* Non-earned income toggle - only for income transactions */}
          {transactionType === 'income' && (
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="splitNonEarned"
                checked={isNonEarned}
                onChange={(e) => setIsNonEarned(e.target.checked)}
                className="w-4 h-4 text-primary rounded border-border-strong focus:ring-primary"
              />
              <label htmlFor="splitNonEarned" className="text-sm text-text-secondary">
                Non-earned income <span className="text-text-tertiary text-xs">(gifts, refunds, etc.)</span>
              </label>
            </div>
          )}

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
            <Button type="submit" disabled={!isBalanced} className="flex-1">
              {isEditMode ? 'Update Split' : 'Split Transaction'}
            </Button>
            <Button variant="secondary" onClick={onClose} className="flex-1">
              Cancel
            </Button>
          </div>

          {/* Remove split button - only in edit mode */}
          {isEditMode && onUnsplit && (
            <div className="mt-2">
              {!showUnsplitConfirm ? (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowUnsplitConfirm(true)}
                  className="w-full text-danger hover:bg-danger-light hover:text-danger"
                >
                  Remove Split
                </Button>
              ) : (
                <div className="p-3 bg-danger-light rounded-lg space-y-2">
                  <p className="text-sm text-danger">
                    This will remove all splits and return the transaction to uncategorized.
                  </p>
                  <div className="flex gap-2">
                    <Button variant="danger" size="sm" onClick={onUnsplit} className="flex-1">
                      Remove Split
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => setShowUnsplitConfirm(false)}
                      className="flex-1 bg-surface"
                    >
                      Keep Split
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </form>
    </Modal>
  );
}
