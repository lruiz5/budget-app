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
    <div className="bg-purple-50 rounded-lg shadow-sm overflow-hidden">
      <div className="bg-purple-600 px-6 py-4 flex items-center justify-between">
        <h2 className="text-xl font-semibold text-white">Starting Balance (Buffer)</h2>
        <div className="flex items-center gap-2">
          <span className="text-sm opacity-90 text-white">Amount:</span>
          <div className="bg-white rounded px-3 py-1">
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
              className="w-32 text-right px-1 py-0 text-lg font-semibold text-gray-900 focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
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