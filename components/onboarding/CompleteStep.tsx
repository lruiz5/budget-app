'use client';

import { useEffect } from 'react';
import { formatCurrency } from '@/lib/formatCurrency';

interface CreatedItem {
  id: number;
  categoryName: string;
  name: string;
  planned: number;
}

interface CompleteStepProps {
  buffer: number;
  createdItems: CreatedItem[];
  addedTransaction: boolean;
}

export default function CompleteStep({ buffer, createdItems, addedTransaction }: CompleteStepProps) {
  useEffect(() => {
    // Mark onboarding as complete
    fetch('/api/onboarding', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'complete' }),
    });
  }, []);

  const totalPlanned = createdItems.reduce((sum, item) => sum + item.planned, 0);

  return (
    <div className="max-w-lg mx-auto text-center">
      <div className="text-6xl mb-6">🎉</div>
      <h2 className="text-3xl font-bold text-text-primary mb-2">
        You&apos;re All Set!
      </h2>
      <p className="text-text-secondary mb-8">
        Your budget is ready to go. Here&apos;s a summary of what you&apos;ve set up:
      </p>

      <div className="bg-surface rounded-xl shadow-md p-6 mb-8 text-left">
        <div className="space-y-3">
          <div className="flex justify-between items-center py-2 border-b border-border">
            <span className="text-text-secondary">💼 Buffer</span>
            <span className="font-semibold text-text-primary">${formatCurrency(buffer)}</span>
          </div>
          <div className="flex justify-between items-center py-2 border-b border-border">
            <span className="text-text-secondary">📋 Budget Items</span>
            <span className="font-semibold text-text-primary">{createdItems.length} items</span>
          </div>
          <div className="flex justify-between items-center py-2 border-b border-border">
            <span className="text-text-secondary">💰 Total Planned</span>
            <span className="font-semibold text-text-primary">${formatCurrency(totalPlanned)}</span>
          </div>
          <div className="flex justify-between items-center py-2">
            <span className="text-text-secondary">📝 First Transaction</span>
            <span className={`font-semibold ${addedTransaction ? 'text-success' : 'text-text-tertiary'}`}>
              {addedTransaction ? '✅ Added' : 'Skipped'}
            </span>
          </div>
        </div>
      </div>

      <div className="bg-surface rounded-xl shadow-md p-5 mb-8 text-left">
        <p className="text-sm font-medium text-text-secondary mb-3">What&apos;s next?</p>
        <ul className="space-y-2 text-sm text-text-secondary">
          <li>🏦 Connect your bank account for automatic imports</li>
          <li>🔄 Set up recurring payments for bills and subscriptions</li>
          <li>📊 Check Insights for spending analysis</li>
        </ul>
      </div>

      <a
        href="/"
        className="inline-block bg-primary text-white px-10 py-3 rounded-lg text-lg font-semibold hover:bg-primary-hover transition-colors"
      >
        Go to Dashboard
      </a>
    </div>
  );
}
