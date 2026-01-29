'use client';

interface WelcomeStepProps {
  onNext: () => void;
}

export default function WelcomeStep({ onNext }: WelcomeStepProps) {
  return (
    <div className="text-center max-w-lg mx-auto">
      <div className="text-6xl mb-6">👋</div>
      <h1 className="text-3xl font-bold text-text-primary mb-4">
        Welcome to Budget App!
      </h1>
      <p className="text-lg text-text-secondary mb-2">
        Take control of your money with zero-based budgeting.
      </p>
      <p className="text-text-tertiary mb-10">
        We&apos;ll walk you through setting up your first budget in just a few steps.
      </p>
      <button
        onClick={onNext}
        className="bg-primary text-white px-10 py-3 rounded-lg text-lg font-semibold hover:bg-primary-hover transition-colors"
      >
        Get Started
      </button>
    </div>
  );
}
