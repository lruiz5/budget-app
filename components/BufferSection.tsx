'use client';

import { useState } from 'react';

interface BufferSectionProps {
  budgetId?: number;
  buffer: number;
  onRefresh: () => void;
}

export default function BufferSection({ budgetId, buffer, onRefresh }: BufferSectionProps) {
  const [editingValue, setEditingValue] = useState<number | undefined>(undefined);

  const updateBuffer = async (value: number) => {
    if (!budgetId) {
      console.error('Budget ID not found');
      return;
    }

    try {
      await fetch('/api/budgets', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: budgetId,
          buffer: value,
        }),
      });
      onRefresh();
    } catch (error) {
      console.error('Error updating buffer:', error);
    }
  };

  return (
    <div className="bg-white rounded-lg shadow-sm overflow-hidden">
      <div className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
        <h2 className="text-xl font-semibold text-gray-800 flex items-center gap-2">
          <span>💼</span>
          <span>Starting Balance (Buffer)</span>
        </h2>
        <div className="flex items-center gap-2">
          <span className="text-sm opacity-90 text-gray-700">Amount:</span>
          <div className="bg-gray-50 rounded px-3 py-1">
            <span className="text-gray-500">$</span>
            <input
              type="number"
              value={editingValue !== undefined ? editingValue : buffer || ''}
              onChange={(e) => {
                const value = e.target.value;
                setEditingValue(parseFloat(value) || 0);
              }}
              onFocus={(e) => e.target.select()}
              onBlur={() => {
                if (editingValue !== undefined) {
                  updateBuffer(editingValue);
                  setEditingValue(undefined);
                }
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.currentTarget.blur();
                }
              }}
              className="w-32 text-right px-1 py-0 text-lg font-semibold text-gray-900 focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none bg-gray-50"
              step="0.01"
            />
          </div>
        </div>
      </div>
      <div className="px-6 py-3 text-sm text-gray-600">
        This is the amount carried over from the previous month
      </div>
    </div>
  );
}