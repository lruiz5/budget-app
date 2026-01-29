'use client';

import { useState, useEffect, useCallback } from 'react';
import WelcomeStep from '@/components/onboarding/WelcomeStep';
import ConceptsStep from '@/components/onboarding/ConceptsStep';
import BufferStep from '@/components/onboarding/BufferStep';
import ItemsStep from '@/components/onboarding/ItemsStep';
import TransactionStep from '@/components/onboarding/TransactionStep';
import CompleteStep from '@/components/onboarding/CompleteStep';

interface CategoryInfo {
  id: number;
  type: string;
  name: string;
  emoji: string;
}

interface CreatedItem {
  id: number;
  categoryName: string;
  name: string;
  planned: number;
}

const TOTAL_STEPS = 6;

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

export default function OnboardingPage() {
  const [currentStep, setCurrentStep] = useState(1);
  const [loading, setLoading] = useState(true);
  const [budgetId, setBudgetId] = useState<number | null>(null);
  const [categories, setCategories] = useState<CategoryInfo[]>([]);
  const [createdItems, setCreatedItems] = useState<CreatedItem[]>([]);
  const [bufferAmount, setBufferAmount] = useState(0);
  const [addedTransaction, setAddedTransaction] = useState(false);

  const initializeBudget = useCallback(async () => {
    const now = new Date();
    const month = now.getMonth();
    const year = now.getFullYear();

    const res = await fetch(`/api/budgets?month=${month}&year=${year}`);
    const budget = await res.json();

    if (budget?.id) {
      setBudgetId(budget.id);
      setBufferAmount(budget.buffer || 0);

      if (budget.categories) {
        const cats: CategoryInfo[] = budget.categories.map((c: { id: number; categoryType: string; name: string }) => ({
          id: c.id,
          type: c.categoryType,
          name: c.name,
          emoji: emojiMap[c.categoryType] || '📋',
        }));
        setCategories(cats);

        // Collect any existing items (for resume case)
        const existingItems: CreatedItem[] = [];
        for (const cat of budget.categories) {
          for (const item of cat.items || []) {
            existingItems.push({
              id: item.id,
              categoryName: cat.name,
              name: item.name,
              planned: item.planned,
            });
          }
        }
        if (existingItems.length > 0) {
          setCreatedItems(existingItems);
        }
      }
    }
  }, []);

  useEffect(() => {
    async function init() {
      // Check onboarding status
      const statusRes = await fetch('/api/onboarding');
      const status = await statusRes.json();

      if (status.completed) {
        // Already completed — allow revisit but start at step 1
        setCurrentStep(1);
      } else if (status.currentStep > 1) {
        setCurrentStep(status.currentStep);
      }

      // Initialize or create onboarding record
      await fetch('/api/onboarding', { method: 'POST' });

      // Ensure budget exists
      await initializeBudget();

      setLoading(false);
    }
    init();
  }, [initializeBudget]);

  const handleSkip = async () => {
    await fetch('/api/onboarding', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'skip' }),
    });
    window.location.href = '/';
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-surface-secondary flex items-center justify-center">
        <div className="text-text-tertiary">Loading...</div>
      </div>
    );
  }

  return (
    <div className="h-screen bg-surface-secondary flex flex-col overflow-hidden">
      {/* Header with progress and skip */}
      <div className="w-full max-w-2xl mx-auto px-6 pt-8 pb-4">
        <div className="flex items-center justify-between mb-6">
          <span className="text-sm text-text-tertiary">
            Step {currentStep} of {TOTAL_STEPS}
          </span>
          {currentStep < TOTAL_STEPS && (
            <button
              onClick={handleSkip}
              className="text-sm text-text-tertiary hover:text-text-secondary transition-colors"
            >
              Skip setup
            </button>
          )}
        </div>

        {/* Progress bar */}
        <div className="flex gap-2">
          {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
            <div
              key={i}
              className={`h-1.5 flex-1 rounded-full transition-colors ${
                i + 1 < currentStep
                  ? 'bg-success'
                  : i + 1 === currentStep
                  ? 'bg-primary'
                  : 'bg-border'
              }`}
            />
          ))}
        </div>
      </div>

      {/* Step content */}
      <div className="flex-1 overflow-y-auto px-6 py-8">
        <div className="w-full max-w-2xl mx-auto">
          {currentStep === 1 && (
            <WelcomeStep onNext={() => setCurrentStep(2)} />
          )}
          {currentStep === 2 && (
            <ConceptsStep
              onNext={() => setCurrentStep(3)}
              onBack={() => setCurrentStep(1)}
            />
          )}
          {currentStep === 3 && (
            <BufferStep
              budgetId={budgetId}
              onNext={() => {
                setBufferAmount(bufferAmount);
                setCurrentStep(4);
              }}
              onBack={() => setCurrentStep(2)}
            />
          )}
          {currentStep === 4 && (
            <ItemsStep
              categories={categories}
              createdItems={createdItems}
              setCreatedItems={setCreatedItems}
              onNext={() => setCurrentStep(5)}
              onBack={() => setCurrentStep(3)}
            />
          )}
          {currentStep === 5 && (
            <TransactionStep
              createdItems={createdItems}
              onNext={() => {
                setAddedTransaction(true);
                setCurrentStep(6);
              }}
              onBack={() => setCurrentStep(4)}
            />
          )}
          {currentStep === 6 && (
            <CompleteStep
              buffer={bufferAmount}
              createdItems={createdItems}
              addedTransaction={addedTransaction}
            />
          )}
        </div>
      </div>
    </div>
  );
}
