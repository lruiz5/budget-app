import { SignUp } from '@clerk/nextjs';

export default function SignUpPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-surface-secondary relative overflow-hidden">
      {/* Diagonal repeating text background */}
      <div
        className="absolute inset-0 pointer-events-none select-none"
        aria-hidden="true"
      >
        <div
          className="absolute flex flex-col justify-center"
          style={{
            transform: 'rotate(-45deg)',
            top: '-100%',
            left: '-100%',
            right: '-100%',
            bottom: '-100%',
          }}
        >
          {Array.from({ length: 50 }).map((_, row) => {
            const goLeft = row % 2 === 0;
            const speed = row % 3 === 0 ? '240s' : row % 3 === 1 ? '320s' : '280s';
            const gap = row % 2 === 0 ? 'gap-10' : 'gap-14';
            const size = row % 3 === 0 ? 'text-2xl' : row % 3 === 1 ? 'text-xl' : 'text-3xl';
            const opacity = row % 3 === 0 ? 'text-primary/[0.05]' : row % 3 === 1 ? 'text-primary/[0.07]' : 'text-primary/[0.04]';
            return (
              <div key={row} className="overflow-hidden mb-5">
                <div
                  className={`flex ${gap} whitespace-nowrap`}
                  style={{
                    animation: `${goLeft ? 'scroll-left' : 'scroll-right'} ${speed} linear infinite`,
                  }}
                >
                  {/* Duplicate content for seamless loop */}
                  {[0, 1].map((half) => (
                    <div key={half} className={`flex ${gap} shrink-0`}>
                      {Array.from({ length: 30 }).map((_, col) => (
                        <span
                          key={col}
                          className={`${size} font-bold ${opacity} uppercase tracking-widest`}
                        >
                          Budget App
                        </span>
                      ))}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <SignUp
        fallbackRedirectUrl="/onboarding"
        appearance={{
          variables: {
            colorPrimary: '#059669',
            colorTextOnPrimaryBackground: '#ffffff',
            colorBackground: '#ffffff',
            colorText: '#111827',
            colorTextSecondary: '#4b5563',
            colorInputBackground: '#ffffff',
            colorInputText: '#111827',
            borderRadius: '0.5rem',
            fontFamily: 'Outfit, sans-serif',
          },
          elements: {
            rootBox: 'mx-auto',
            card: 'shadow-xl border border-border',
          },
        }}
      />
    </div>
  );
}
