'use client';

import { useState } from 'react';
import { BudgetCategory, Transaction } from '@/types/budget';
import TransactionModal from './TransactionModal';

interface BudgetSectionProps {
  category: BudgetCategory;
  onRefresh: () => void;
  isIncome?: boolean;
}

export default function BudgetSection({ category, onRefresh, isIncome = false }: BudgetSectionProps) {
  const [newItemName, setNewItemName] = useState('');
  const [isAddingItem, setIsAddingItem] = useState(false);
  const [isTransactionModalOpen, setIsTransactionModalOpen] = useState(false);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [selectedItemName, setSelectedItemName] = useState<string>('');
  const [expandedItemId, setExpandedItemId] = useState<string | null>(null);
  const [editingValues, setEditingValues] = useState<Record<string, number>>({});
  const [editingNames, setEditingNames] = useState<Record<string, string>>({});

  const addItem = async () => {
    if (!newItemName.trim()) return;
    if (!category.dbId) {
      console.error('Category database ID not found');
      return;
    }

    try {
      const response = await fetch('/api/budget-items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          categoryId: category.dbId,
          name: newItemName,
          planned: 0,
        }),
      });

      if (response.ok) {
        setNewItemName('');
        setIsAddingItem(false);
        onRefresh();
      }
    } catch (error) {
      console.error('Error adding item:', error);
    }
  };

  const updateItemPlanned = async (itemId: string, value: number) => {
    try {
      await fetch('/api/budget-items', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: itemId,
          planned: value,
        }),
      });
      onRefresh();
    } catch (error) {
      console.error('Error updating item:', error);
    }
  };

  const updateItemName = async (itemId: string, name: string) => {
    if (!name.trim()) return;
    try {
      await fetch('/api/budget-items', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: itemId,
          name: name.trim(),
        }),
      });
      onRefresh();
    } catch (error) {
      console.error('Error updating item name:', error);
    }
  };

  const addTransaction = async (transaction: Omit<Transaction, 'id'>) => {
    try {
      const response = await fetch('/api/transactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(transaction),
      });

      if (response.ok) {
        onRefresh();
      }
    } catch (error) {
      console.error('Error adding transaction:', error);
    }
  };

  const deleteTransaction = async (transactionId: string) => {
    try {
      await fetch(`/api/transactions?id=${transactionId}`, {
        method: 'DELETE',
      });
      onRefresh();
    } catch (error) {
      console.error('Error deleting transaction:', error);
    }
  };

  const deleteItem = async (itemId: string) => {
    try {
      await fetch(`/api/budget-items?id=${itemId}`, {
        method: 'DELETE',
      });
      onRefresh();
    } catch (error) {
      console.error('Error deleting item:', error);
    }
  };

  const openTransactionModal = (itemId: string, itemName: string) => {
    setSelectedItemId(itemId);
    setSelectedItemName(itemName);
    setIsTransactionModalOpen(true);
  };

  const toggleExpanded = (itemId: string) => {
    setExpandedItemId(expandedItemId === itemId ? null : itemId);
  };

  const totalPlanned = category.items.reduce((sum, item) => sum + item.planned, 0);
  const totalActual = category.items.reduce((sum, item) => sum + item.actual, 0);

  const bgColor = isIncome ? 'bg-green-50' : 'bg-white';
  const headerColor = isIncome ? 'bg-green-600' : 'bg-blue-600';

  return (
    <>
      <div className={`${bgColor} rounded-lg shadow-sm overflow-hidden`}>
        <div className={`${headerColor} px-6 py-4 flex items-center justify-between`}>
          <h2 className="text-xl font-semibold text-white">{category.name}</h2>
          <div className="flex gap-8 text-white">
            <div className="text-right">
              <div className="text-sm opacity-90">Planned</div>
              <div className="text-lg font-semibold">${totalPlanned.toFixed(2)}</div>
            </div>
            <div className="text-right">
              <div className="text-sm opacity-90">Actual</div>
              <div className="text-lg font-semibold">${totalActual.toFixed(2)}</div>
            </div>
          </div>
        </div>

        <div className="p-6">
          {category.items.length === 0 && !isAddingItem && (
            <p className="text-gray-500 text-center py-4">No items added yet</p>
          )}

          {category.items.length > 0 && (
            <div className="space-y-2">
              <div className="grid grid-cols-12 gap-4 text-sm font-semibold text-gray-600 pb-2 border-b">
                <div className="col-span-5">Item</div>
                <div className="col-span-2 text-right">Planned</div>
                <div className="col-span-2 text-right">Actual</div>
                <div className="col-span-2 text-right">Difference</div>
                <div className="col-span-1"></div>
              </div>

              {category.items.map(item => {
                const difference = item.planned - item.actual;
                const isExpanded = expandedItemId === item.id;
                return (
                  <div key={item.id} className="border-b border-gray-100 last:border-0">
                    <div className="grid grid-cols-12 gap-4 items-center py-2 hover:bg-gray-50 rounded">
                      <div className="col-span-5 flex items-center gap-2">
                        {item.transactions.length > 0 && (
                          <button
                            onClick={() => toggleExpanded(item.id)}
                            className="text-gray-500 hover:text-gray-700"
                          >
                            {isExpanded ? '▼' : '▶'}
                          </button>
                        )}
                        <input
                          type="text"
                          value={editingNames[item.id] !== undefined ? editingNames[item.id] : item.name}
                          onChange={(e) => {
                            setEditingNames({ ...editingNames, [item.id]: e.target.value });
                          }}
                          onFocus={(e) => e.target.select()}
                          onBlur={() => {
                            if (editingNames[item.id] !== undefined) {
                              updateItemName(item.id, editingNames[item.id]);
                              const newNames = { ...editingNames };
                              delete newNames[item.id];
                              setEditingNames(newNames);
                            }
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.currentTarget.blur();
                            }
                          }}
                          className="flex-1 font-medium text-gray-900 px-2 py-1 border border-transparent hover:border-gray-300 focus:border-blue-500 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                        {item.transactions.length > 0 && (
                          <span className="text-xs text-gray-500">
                            ({item.transactions.length})
                          </span>
                        )}
                      </div>
                      <div className="col-span-2">
                        <input
                          type="number"
                          value={editingValues[item.id] !== undefined ? editingValues[item.id] : item.planned || ''}
                          onChange={(e) => {
                            const value = e.target.value;
                            setEditingValues({ ...editingValues, [item.id]: parseFloat(value) || 0 });
                          }}
                          onFocus={(e) => e.target.select()}
                          onBlur={() => {
                            if (editingValues[item.id] !== undefined) {
                              updateItemPlanned(item.id, editingValues[item.id]);
                              const newValues = { ...editingValues };
                              delete newValues[item.id];
                              setEditingValues(newValues);
                            }
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.currentTarget.blur();
                            }
                          }}
                          className="w-full text-right px-2 py-1 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                          step="0.01"
                        />
                      </div>
                      <div className="col-span-2">
                        <div className="text-right px-2 py-1 text-gray-700 font-medium">
                          ${item.actual.toFixed(2)}
                        </div>
                      </div>
                      <div className="col-span-2 text-right">
                        <span className={difference < 0 ? 'text-red-600' : 'text-green-600'}>
                          ${Math.abs(difference).toFixed(2)}
                        </span>
                      </div>
                      <div className="col-span-1 flex items-center justify-end gap-1">
                        <button
                          onClick={() => openTransactionModal(item.id, item.name)}
                          className="text-blue-600 hover:text-blue-800 text-sm font-medium"
                          title="Add transaction"
                        >
                          +$
                        </button>
                        <button
                          onClick={() => deleteItem(item.id)}
                          className="text-red-600 hover:text-red-800"
                          title="Delete item"
                        >
                          ×
                        </button>
                      </div>
                    </div>

                    {isExpanded && item.transactions.length > 0 && (
                      <div className="ml-8 mb-3 bg-gray-50 rounded p-3">
                        <div className="text-xs font-semibold text-gray-600 mb-2">Transactions</div>
                        <div className="space-y-1">
                          {item.transactions.map(transaction => (
                            <div
                              key={transaction.id}
                              className="flex items-center justify-between text-sm py-1 hover:bg-white rounded px-2"
                            >
                              <div className="flex-1">
                                <span className="text-gray-600">
                                  {new Date(transaction.date).toLocaleDateString()}
                                </span>
                                <span className="ml-3 text-gray-900">{transaction.description}</span>
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="font-medium text-gray-900">
                                  ${transaction.amount.toFixed(2)}
                                </span>
                                <button
                                  onClick={() => deleteTransaction(transaction.id)}
                                  className="text-red-600 hover:text-red-800 text-xs"
                                >
                                  ×
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {isAddingItem && (
            <div className="mt-4 flex gap-2">
              <input
                type="text"
                value={newItemName}
                onChange={(e) => setNewItemName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && addItem()}
                onFocus={(e) => e.target.select()}
                placeholder="Item name"
                className="flex-1 px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                autoFocus
              />
              <button
                onClick={addItem}
                className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
              >
                Add
              </button>
              <button
                onClick={() => {
                  setIsAddingItem(false);
                  setNewItemName('');
                }}
                className="px-4 py-2 bg-gray-300 text-gray-700 rounded hover:bg-gray-400"
              >
                Cancel
              </button>
            </div>
          )}

          {!isAddingItem && (
            <button
              onClick={() => setIsAddingItem(true)}
              className="mt-4 w-full py-2 border-2 border-dashed border-gray-300 rounded text-gray-600 hover:border-blue-500 hover:text-blue-600 transition-colors"
            >
              + Add Item
            </button>
          )}
        </div>
      </div>

      {selectedItemId && (
        <TransactionModal
          isOpen={isTransactionModalOpen}
          onClose={() => {
            setIsTransactionModalOpen(false);
            setSelectedItemId(null);
            setSelectedItemName('');
          }}
          onAddTransaction={addTransaction}
          budgetItemId={selectedItemId}
          budgetItemName={selectedItemName}
        />
      )}
    </>
  );
}