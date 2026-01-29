'use client';

import { FaPiggyBank, FaBalanceScale, FaBullseye } from 'react-icons/fa';

interface ConceptsStepProps {
  onNext: () => void;
  onBack: () => void;
}

const concepts = [
  {
    icon: <FaPiggyBank size={32} className="text-primary" />,
    title: 'Start with your buffer',
    description: 'Your buffer is money carried over from last month — your starting balance for the new month.',
  },
  {
    icon: <FaBalanceScale size={32} className="text-primary" />,
    title: 'Assign every dollar',
    description: 'Zero-based means every dollar is assigned a purpose — whether that\'s bills, savings, or fun money. It doesn\'t mean spend everything; it means plan for everything, including what you set aside.',
  },
  {
    icon: <FaBullseye size={32} className="text-primary" />,
    title: 'Stay balanced',
    description: 'When your budget shows $0 left to assign, you\'re balanced! Track spending against your plan throughout the month.',
  },
];

export default function ConceptsStep({ onNext, onBack }: ConceptsStepProps) {
  return (
    <div className="max-w-2xl mx-auto">
      <h2 className="text-2xl font-bold text-text-primary text-center mb-2">
        What is Zero-Based Budgeting?
      </h2>
      <p className="text-text-secondary text-center mb-8">
        A simple method where every dollar has a purpose.
      </p>

      <div className="space-y-4 mb-8">
        {concepts.map((concept, i) => (
          <div key={i} className="bg-surface rounded-xl shadow-md p-6 flex items-start gap-5">
            <div className="shrink-0 w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center">
              {concept.icon}
            </div>
            <div>
              <h3 className="font-semibold text-text-primary text-lg mb-1">{concept.title}</h3>
              <p className="text-text-secondary">{concept.description}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="bg-surface rounded-xl shadow-md p-6 mb-10">
        <p className="text-sm text-text-tertiary font-medium uppercase tracking-wide mb-3">Example</p>
        <div className="font-mono text-sm space-y-1 text-text-secondary">
          <div className="flex justify-between"><span>💼 Buffer</span><span>$500</span></div>
          <div className="flex justify-between"><span>💰 Income</span><span>+ $3,000</span></div>
          <div className="border-t border-border my-2" />
          <div className="flex justify-between font-semibold text-text-primary"><span>Total Available</span><span>$3,500</span></div>
          <div className="mt-3 flex justify-between"><span>🏠 Household</span><span>$1,200</span></div>
          <div className="flex justify-between"><span>🚗 Transportation</span><span>$400</span></div>
          <div className="flex justify-between"><span>🍽️ Food</span><span>$600</span></div>
          <div className="flex justify-between"><span>👤 Personal</span><span>$300</span></div>
          <div className="flex justify-between"><span>💵 Saving</span><span>$1,000</span></div>
          <div className="border-t border-border my-2" />
          <div className="flex justify-between font-semibold text-success"><span>Left to budget</span><span>$0.00 ✅</span></div>
        </div>
      </div>

      <div className="flex justify-between">
        <button
          onClick={onBack}
          className="border border-border-strong text-text-secondary px-6 py-3 rounded-lg hover:bg-surface-secondary transition-colors"
        >
          Back
        </button>
        <button
          onClick={onNext}
          className="bg-primary text-white px-8 py-3 rounded-lg font-semibold hover:bg-primary-hover transition-colors"
        >
          Got it, let&apos;s set up!
        </button>
      </div>
    </div>
  );
}
