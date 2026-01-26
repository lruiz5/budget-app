'use client';

import { ReactNode } from 'react';
import Sidebar from './Sidebar';

interface DashboardLayoutProps {
  children: ReactNode;
  onOpenMonthlyReport?: () => void;
}

export default function DashboardLayout({ children, onOpenMonthlyReport }: DashboardLayoutProps) {
  return (
    <div className="h-screen flex overflow-hidden bg-gray-50">
      <Sidebar onOpenMonthlyReport={onOpenMonthlyReport} />
      <main className="flex-1 overflow-hidden">
        {children}
      </main>
    </div>
  );
}