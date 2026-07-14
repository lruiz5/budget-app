'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { UserButton, useUser } from '@clerk/nextjs';
import {
  Wallet,
  Landmark,
  ChartLine,
  ChevronLeft,
  ChevronRight,
  ArrowLeftRight,
  Lightbulb,
} from "lucide-react";

interface NavItem {
  id: string;
  label: string;
  icon: React.ReactNode;
  href: string;
}

function ActiveBar() {
  return (
    <span
      aria-hidden="true"
      className="absolute left-0 top-1/2 -translate-y-1/2 h-5 w-1 rounded-r-full bg-primary"
    />
  );
}

function Wordmark({ collapsed }: { collapsed: boolean }) {
  return (
    <div className={`flex items-center ${collapsed ? '' : 'gap-2.5'}`}>
      <div className="w-8 h-8 flex-shrink-0 rounded-lg bg-gradient-to-br from-primary to-primary-hover flex items-center justify-center shadow-sm">
        <Wallet size={16} className="text-white" />
      </div>
      {!collapsed && (
        <span className="text-lg font-bold tracking-tight text-white">
          Budget<span className="text-primary-border">App</span>
        </span>
      )}
    </div>
  );
}

export default function Sidebar() {
  const [isCollapsed, setIsCollapsed] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth < 1024 : false
  );

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 1023px)');
    const handler = (e: MediaQueryListEvent) => setIsCollapsed(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { user } = useUser();

  const monthParam = searchParams.get('month');
  const yearParam = searchParams.get('year');
  const monthYearQuery = monthParam !== null && yearParam !== null ? `?month=${monthParam}&year=${yearParam}` : '';

  const navItems: NavItem[] = [
    {
      id: 'budget',
      label: 'Budget',
      icon: <Wallet size={20} />,
      href: '/',
    },
    {
      id: 'cash-flow',
      label: 'Cash Flow',
      icon: <ArrowLeftRight size={20} />,
      href: '/cash-flow',
    },
    {
      id: 'accounts',
      label: 'Accounts',
      icon: <Landmark size={20} />,
      href: '/settings',
    },
    {
      id: 'insights',
      label: 'Insights',
      icon: <ChartLine size={20} />,
      href: '/insights',
    },
  ];

  const isActive = (href: string) => {
    if (href === '/') return pathname === '/';
    return pathname.startsWith(href);
  };

  const navLinkClass = (active: boolean) =>
    `relative flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors ${
      active
        ? 'bg-sidebar-hover text-white'
        : 'text-sidebar-text-muted hover:bg-sidebar-hover/60 hover:text-white'
    }`;

  return (
    <div
      className={`bg-sidebar-bg text-white flex flex-col transition-all duration-300 ${
        isCollapsed ? 'w-16' : 'w-64'
      }`}
    >
      {/* Wordmark + collapse toggle */}
      {isCollapsed ? (
        <div className="flex flex-col items-center gap-1 py-3 border-b border-sidebar-border">
          <Wordmark collapsed />
          <button
            onClick={() => setIsCollapsed(false)}
            className="p-2 text-sidebar-text-muted hover:bg-sidebar-hover hover:text-white rounded-lg transition-colors"
            title="Expand sidebar"
            aria-label="Expand sidebar"
          >
            <ChevronRight size={14} />
          </button>
        </div>
      ) : (
        <div className="h-16 flex items-center justify-between px-4 border-b border-sidebar-border">
          <Wordmark collapsed={false} />
          <button
            onClick={() => setIsCollapsed(true)}
            className="p-2 text-sidebar-text-muted hover:bg-sidebar-hover hover:text-white rounded-lg transition-colors"
            title="Collapse sidebar"
            aria-label="Collapse sidebar"
          >
            <ChevronLeft size={14} />
          </button>
        </div>
      )}

      {/* Navigation */}
      <nav className="flex-1 py-4">
        <ul className="space-y-1 px-2">
          {navItems.map((item) => {
            const active = isActive(item.href);
            return (
              <li key={item.id}>
                <Link
                  href={`${item.href}${monthYearQuery}`}
                  className={navLinkClass(active)}
                  title={isCollapsed ? item.label : undefined}
                >
                  {active && <ActiveBar />}
                  <span className={`flex-shrink-0 ${active ? 'text-primary-border' : ''}`}>
                    {item.icon}
                  </span>
                  {!isCollapsed && <span className="text-sm font-medium">{item.label}</span>}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Help */}
      <div className="px-2 mb-2">
        <Link
          href="/onboarding"
          className={navLinkClass(isActive('/onboarding'))}
          title={isCollapsed ? 'Getting Started' : undefined}
        >
          {isActive('/onboarding') && <ActiveBar />}
          <span className={`flex-shrink-0 ${isActive('/onboarding') ? 'text-primary-border' : ''}`}>
            <Lightbulb size={20} />
          </span>
          {!isCollapsed && <span className="text-sm font-medium">Getting Started</span>}
        </Link>
      </div>

      {/* Footer */}
      <div className={`p-4 border-t border-sidebar-border ${isCollapsed ? 'flex justify-center' : ''}`}>
        <div className={`flex items-center ${isCollapsed ? '' : 'gap-3'}`}>
          <UserButton
            afterSignOutUrl="/sign-in"
            appearance={{
              elements: {
                avatarBox: 'h-8 w-8',
              }
            }}
          />
          {!isCollapsed && (
            <span className="text-sm text-sidebar-text-muted">{user?.firstName || 'Account'}</span>
          )}
        </div>
      </div>
    </div>
  );
}
