import { TriangleAlert } from 'lucide-react';

interface MonthBannerProps {
  isPast: boolean;
  currentMonthName: string;
  onGoToCurrent: () => void;
}

export default function MonthBanner({ isPast, currentMonthName, onGoToCurrent }: MonthBannerProps) {
  return (
    <div className="flex items-center justify-between gap-4 bg-warning-light border-b border-warning/30 px-6 py-2.5">
      <p className="flex items-center gap-2 text-sm text-warning-strong">
        <TriangleAlert size={14} className="flex-shrink-0" />
        <span>
          <strong className="font-semibold">{isPast ? 'Past month' : 'Future month'}</strong>
          <span className="mx-2" aria-hidden="true">·</span>
          You{'’'}re viewing {isPast ? 'a past' : 'a future'} month{'’'}s budget
        </span>
      </p>
      <button
        onClick={onGoToCurrent}
        className="flex-none rounded-full bg-warning-strong px-3.5 py-1 text-sm font-semibold text-white hover:bg-warning-strong/90 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-warning-strong"
      >
        Go to {currentMonthName} <span aria-hidden="true">&rarr;</span>
      </button>
    </div>
  );
}
