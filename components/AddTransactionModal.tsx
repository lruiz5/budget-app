'use client';

import { useState, useEffect } from 'react';
import { BudgetItem } from '@/types/budget';

interface LinkedAccount {
  id: string;
  accountName: string;
  institutionName: string;
  lastFour: string;
  accountSubtype: string;
}

export interface TransactionToEdit {
  id: string;
  budgetItemId?: string | null;
  linkedAccountId?: string | null;
  date: string;
  description: string;
  amount: number;
  type: 'income' | 'expense';
  merchant?: string | null;
}

interface AddTransactionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAddTransaction: (transaction: {
    budgetItemId: string;
    linkedAccountId?: string;
    date: string;
    description: string;
    amount: number;
    type: 'income' | 'expense';
    merchant?: string;
  }) => void;
  onEditTransaction?: (transaction: {
    id: string;
    budgetItemId: string;
    linkedAccountId?: string;
    date: string;
    description: string;
    amount: number;
    type: 'income' | 'expense';
    merchant?: string;
  }) => void;
  onDeleteTransaction?: (id: string) => void;
  budgetItems: { category: string; items: BudgetItem[] }[];
  linkedAccounts?: LinkedAccount[];
  transactionToEdit?: TransactionToEdit | null;
  defaultBudgetItemId?: string;
  defaultType?: 'income' | 'expense';
}

export default function AddTransactionModal({
  isOpen,
  onClose,
  onAddTransaction,
  onEditTransaction,
  onDeleteTransaction,
  budgetItems,
  linkedAccounts = [],
  transactionToEdit,
  defaultBudgetItemId,
  defaultType,
}: AddTransactionModalProps) {
  const [type, setType] = useState<'income' | 'expense'>('expense');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [merchant, setMerchant] = useState('');
  const [linkedAccountId, setLinkedAccountId] = useState<string>('');
  const [budgetItemId, setBudgetItemId] = useState('');

  const isEditMode = !!transactionToEdit;

  // Populate form when editing or use defaults
  useEffect(() => {
    if (transactionToEdit) {
      setType(transactionToEdit.type);
      setAmount(transactionToEdit.amount.toString());
      setDate(transactionToEdit.date);
      setMerchant(transactionToEdit.merchant || '');
      setLinkedAccountId(transactionToEdit.linkedAccountId?.toString() || '');
      setBudgetItemId(transactionToEdit.budgetItemId?.toString() || '');
    } else {
      // Reset form for new transaction, using defaults if provided
      setType(defaultType || 'expense');
      setAmount('');
      setDate(new Date().toISOString().split('T')[0]);
      setMerchant('');
      setLinkedAccountId('');
      setBudgetItemId(defaultBudgetItemId || '');
    }
  }, [transactionToEdit, isOpen, defaultBudgetItemId, defaultType]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!amount || !budgetItemId) return;

    // For edit mode, preserve the original description if merchant is empty
    // For new transactions, use 'Manual transaction' as fallback
    const description = isEditMode
      ? (merchant.trim() || transactionToEdit.description)
      : (merchant.trim() || 'Manual transaction');

    const transactionData = {
      budgetItemId,
      linkedAccountId: linkedAccountId || undefined,
      date,
      description,
      amount: parseFloat(amount),
      type,
      merchant: merchant.trim() || undefined,
    };

    if (isEditMode && onEditTransaction) {
      onEditTransaction({
        id: transactionToEdit.id,
        ...transactionData,
      });
    } else {
      onAddTransaction(transactionData);
    }

    // Reset form
    setType('expense');
    setAmount('');
    setDate(new Date().toISOString().split('T')[0]);
    setMerchant('');
    setLinkedAccountId('');
    setBudgetItemId('');
    onClose();
  };

  const handleDelete = () => {
    if (!transactionToEdit || !onDeleteTransaction) return;
    if (!confirm('Delete this transaction?')) return;

    onDeleteTransaction(transactionToEdit.id);
    onClose();
  };

  if (!isOpen) return null;

  // Check if account is already linked (from Teller sync)
  const hasLinkedAccount = isEditMode && transactionToEdit?.linkedAccountId;
  const linkedAccountDisplay = hasLinkedAccount
    ? linkedAccounts.find(a => a.id === transactionToEdit.linkedAccountId)
    : null;

  return (
    <div className="fixed inset-0 bg-black/15 flex items-center justify-center z-50">
      <div className="bg-surface rounded-lg p-6 max-w-md w-full mx-4 shadow-xl">
        <h2 className="text-2xl font-bold text-text-primary mb-6">
          {isEditMode ? 'Edit Transaction' : 'Add Transaction'}
        </h2>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Type - Radio buttons */}
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-2">
              Type
            </label>
            <div className="flex gap-4">
              <label className="flex items-center cursor-pointer">
                <input
                  type="radio"
                  value="expense"
                  checked={type === 'expense'}
                  onChange={(e) => setType(e.target.value as 'expense')}
                  className="mr-2 w-4 h-4 text-primary"
                />
                <span className="text-sm text-text-secondary">Expense</span>
              </label>
              <label className="flex items-center cursor-pointer">
                <input
                  type="radio"
                  value="income"
                  checked={type === 'income'}
                  onChange={(e) => setType(e.target.value as 'income')}
                  className="mr-2 w-4 h-4 text-primary"
                />
                <span className="text-sm text-text-secondary">Income</span>
              </label>
            </div>
          </div>

          {/* Amount */}
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1">
              Amount
            </label>
            <div className="relative">
              <span className="absolute left-3 top-2 text-text-secondary">$</span>
              <input
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                onFocus={(e) => e.target.select()}
                placeholder="0.00"
                step="0.01"
                className="w-full pl-7 pr-3 py-2 border border-border-strong rounded focus:outline-none focus:ring-2 focus:ring-primary [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                required
                autoFocus
              />
            </div>
          </div>

          {/* Date */}
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1">
              Date
            </label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full px-3 py-2 border border-border-strong rounded focus:outline-none focus:ring-2 focus:ring-primary"
              required
            />
          </div>

          {/* Merchant */}
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1">
              Where did you spend this money?
            </label>
            <input
              type="text"
              value={merchant}
              onChange={(e) => setMerchant(e.target.value)}
              onFocus={(e) => e.target.select()}
              placeholder="e.g., Costco, Amazon, Target"
              className="w-full px-3 py-2 border border-border-strong rounded focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>

          {/* Account - read-only if already linked, editable otherwise */}
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1">
              Account <span className="text-text-tertiary text-xs">(optional)</span>
            </label>
            {hasLinkedAccount && linkedAccountDisplay ? (
              <div className="w-full px-3 py-2 border border-border rounded bg-surface-secondary text-text-secondary">
                {linkedAccountDisplay.institutionName} - {linkedAccountDisplay.accountName} *{linkedAccountDisplay.lastFour}
              </div>
            ) : (
              <select
                value={linkedAccountId}
                onChange={(e) => setLinkedAccountId(e.target.value)}
                className="w-full px-3 py-2 border border-border-strong rounded focus:outline-none focus:ring-2 focus:ring-primary bg-surface"
              >
                <option value="">Select an account...</option>
                {linkedAccounts.map((acct) => (
                  <option key={acct.id} value={acct.id}>
                    {acct.institutionName} - {acct.accountName} *{acct.lastFour}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Budget Item Dropdown */}
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1">
              Budget Item
            </label>
            <select
              value={budgetItemId}
              onChange={(e) => setBudgetItemId(e.target.value)}
              className="w-full px-3 py-2 border border-border-strong rounded focus:outline-none focus:ring-2 focus:ring-primary bg-surface"
              required
            >
              <option value="">Select a budget item...</option>
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
          </div>

          <div className="flex gap-3 mt-6">
            <button
              type="submit"
              className="flex-1 px-4 py-2 bg-primary text-white rounded hover:bg-primary-hover font-medium"
            >
              {isEditMode ? 'Save Changes' : 'Add Transaction'}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 bg-border-strong text-text-secondary rounded hover:bg-border-strong font-medium"
            >
              Cancel
            </button>
          </div>

          {/* Delete button - only in edit mode */}
          {isEditMode && onDeleteTransaction && (
            <button
              type="button"
              onClick={handleDelete}
              className="w-full px-4 py-2 bg-danger-light text-danger rounded hover:bg-danger-light font-medium mt-2"
            >
              Delete Transaction
            </button>
          )}
        </form>
      </div>
    </div>
  );
}
