interface MonthBannerProps {
  isPast: boolean;
  currentMonthName: string;
  onGoToCurrent: () => void;
}

export default function MonthBanner({ isPast, currentMonthName, onGoToCurrent }: MonthBannerProps) {
  return (
    <div className="relative isolate flex items-center overflow-hidden bg-yellow-50 px-6 py-2.5">
      <div
        aria-hidden="true"
        className="absolute top-1/2 left-[max(-7rem,calc(50%-52rem))] -z-10 -translate-y-1/2 transform-gpu blur-2xl"
      >
        <div
          style={{
            clipPath:
              'polygon(74.8% 41.9%, 97.2% 73.2%, 100% 34.9%, 92.5% 0.4%, 87.5% 0%, 75% 28.6%, 58.5% 54.6%, 50.1% 56.8%, 46.9% 44%, 48.3% 17.4%, 24.7% 53.9%, 0% 27.9%, 11.9% 74.2%, 24.9% 54.1%, 68.6% 100%, 74.8% 41.9%)',
          }}
          className="aspect-[577/310] w-[36.0625rem] bg-gradient-to-r from-amber-200 to-yellow-400 opacity-30"
        />
      </div>
      <div
        aria-hidden="true"
        className="absolute top-1/2 left-[max(45rem,calc(50%+8rem))] -z-10 -translate-y-1/2 transform-gpu blur-2xl"
      >
        <div
          style={{
            clipPath:
              'polygon(74.8% 41.9%, 97.2% 73.2%, 100% 34.9%, 92.5% 0.4%, 87.5% 0%, 75% 28.6%, 58.5% 54.6%, 50.1% 56.8%, 46.9% 44%, 48.3% 17.4%, 24.7% 53.9%, 0% 27.9%, 11.9% 74.2%, 24.9% 54.1%, 68.6% 100%, 74.8% 41.9%)',
          }}
          className="aspect-[577/310] w-[36.0625rem] bg-gradient-to-r from-amber-200 to-yellow-400 opacity-30"
        />
      </div>
      <div className="flex flex-1 items-center justify-between gap-x-4">
        <p className="text-sm/6 text-yellow-900">
          <strong className="font-semibold">
            {isPast ? 'Past month' : 'Future month'}
          </strong>
          <svg viewBox="0 0 2 2" aria-hidden="true" className="mx-2 inline size-0.5 fill-current">
            <circle r={1} cx={1} cy={1} />
          </svg>
          You{'\u2019'}re viewing {isPast ? 'a past' : 'a future'} month{'\u2019'}s budget
        </p>
        <button
          onClick={onGoToCurrent}
          className="flex-none rounded-full bg-yellow-900 px-3.5 py-1 text-sm font-semibold text-white shadow-xs hover:bg-yellow-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-yellow-900"
        >
          Go to {currentMonthName} <span aria-hidden="true">&rarr;</span>
        </button>
      </div>
    </div>
  );
}
