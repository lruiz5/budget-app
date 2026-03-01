'use client';

import { useState, useEffect, useCallback } from 'react';
import ServerStep from '@/components/onboarding/ServerStep';
import WelcomeStep from '@/components/onboarding/WelcomeStep';
import CloudSyncStep from '@/components/onboarding/CloudSyncStep';
import { api, ApiError, isServerConfigured } from '@/lib/api-client';
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

const TOTAL_STEPS = 8;

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
  const [budgetId, setBudgetId] = useState<string | null>(null);
  const [categories, setCategories] = useState<CategoryInfo[]>([]);
  const [createdItems, setCreatedItems] = useState<CreatedItem[]>([]);
  const [bufferAmount, setBufferAmount] = useState(0);
  const [addedTransaction, setAddedTransaction] = useState(false);
  const [demoLoading, setDemoLoading] = useState(false);

  const initializeBudget = useCallback(async () => {
    const now = new Date();
    const month = now.getMonth();
    const year = now.getFullYear();

    const budget = await api.budget.get(month, year) as { id?: string; buffer?: number; categories?: Array<{ id: number; categoryType: string; name: string; items?: Array<{ id: number; name: string; planned: number }> }> };

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
      // Step 1 (ServerStep) is purely client-side — check if configured
      if (!isServerConfigured()) {
        setCurrentStep(1);
        setLoading(false);
        return;
      }

      // Server is configured — proceed with API-dependent init
      // DB stores steps 1-6 (old numbering); we display as 2-7 (shifted +1 for ServerStep)
      const status = await api.onboarding.getStatus();

      if (status?.completed) {
        // Already completed — allow revisit, start at Welcome (step 2)
        setCurrentStep(2);
      } else if (status?.currentStep && status.currentStep > 1) {
        // Resume: DB step N maps to display step N+1
        setCurrentStep(status.currentStep + 1);
      } else {
        // Fresh start (server configured but onboarding not started) — go to Welcome
        setCurrentStep(2);
      }

      // Initialize or create onboarding record
      await api.onboarding.initialize();

      // Ensure budget exists
      await initializeBudget();

      setLoading(false);
    }
    init();
  }, [initializeBudget]);

  const handleSkip = async () => {
    await api.onboarding.finish('skip');
    window.location.href = '/';
  };

  const handleLoadDemo = async () => {
    setDemoLoading(true);
    try {
      await api.budget.loadDemo();
      window.location.href = '/';
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        alert('You already have budget data for this month. Please use the regular setup or go to the dashboard.');
      } else {
        alert('Failed to load demo data. Please try again.');
      }
      setDemoLoading(false);
    }
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
          {currentStep > 1 && currentStep < TOTAL_STEPS && (
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
            <ServerStep
              onNext={() => {
                // After server config, reload to re-init with API
                window.location.reload();
              }}
            />
          )}
          {currentStep === 2 && (
            <WelcomeStep
              onNext={() => setCurrentStep(3)}
              onLoadDemo={handleLoadDemo}
              demoLoading={demoLoading}
            />
          )}
          {currentStep === 3 && (
            <CloudSyncStep
              onNext={() => setCurrentStep(4)}
              onSynced={() => { window.location.href = '/'; }}
            />
          )}
          {currentStep === 4 && (
            <ConceptsStep
              onNext={() => setCurrentStep(5)}
              onBack={() => setCurrentStep(3)}
            />
          )}
          {currentStep === 5 && (
            <BufferStep
              budgetId={budgetId}
              onNext={() => {
                setBufferAmount(bufferAmount);
                setCurrentStep(6);
              }}
              onBack={() => setCurrentStep(4)}
            />
          )}
          {currentStep === 6 && (
            <ItemsStep
              categories={categories}
              createdItems={createdItems}
              setCreatedItems={setCreatedItems}
              onNext={() => setCurrentStep(7)}
              onBack={() => setCurrentStep(5)}
            />
          )}
          {currentStep === 7 && (
            <TransactionStep
              createdItems={createdItems}
              onNext={() => {
                setAddedTransaction(true);
                setCurrentStep(8);
              }}
              onBack={() => setCurrentStep(6)}
            />
          )}
          {currentStep === 8 && (
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
