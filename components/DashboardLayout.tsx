'use client';

import { ReactNode, Suspense } from 'react';
import Sidebar from './Sidebar';
import MobileBlockScreen from './MobileBlockScreen';

interface DashboardLayoutProps {
  children: ReactNode;
}

export default function DashboardLayout({ children }: DashboardLayoutProps) {
  return (
    <>
      <MobileBlockScreen />
      <div className="h-screen hidden md:flex overflow-hidden bg-surface-secondary">
        <Suspense>
          <Sidebar />
        </Suspense>
        <main className="flex-1 overflow-hidden">
          {children}
        </main>
      </div>
    </>
  );
}
