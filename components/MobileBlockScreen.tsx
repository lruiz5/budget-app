'use client';

import { FaDesktop } from 'react-icons/fa';

export default function MobileBlockScreen() {
  return (
    <div className="md:hidden fixed inset-0 z-50 bg-surface-primary flex items-center justify-center p-8">
      <div className="text-center max-w-sm">
        <div className="w-16 h-16 bg-primary-light rounded-full flex items-center justify-center mx-auto mb-6">
          <FaDesktop className="text-primary text-2xl" />
        </div>
        <h1 className="text-xl font-semibold text-text-primary mb-3">
          Not Optimized for Mobile
        </h1>
        <p className="text-text-secondary leading-relaxed">
          This app is designed for tablets and larger devices. Please use an iPad or desktop browser for the best experience.
        </p>
      </div>
    </div>
  );
}
