'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { UserButton, useUser } from '@clerk/nextjs';
import {
  FaWallet,
  FaUniversity,
  FaChartLine,
  FaChevronLeft,
  FaChevronRight,
  FaRedo,
  FaLightbulb,
} from 'react-icons/fa';

interface NavItem {
  id: string;
  label: string;
  icon: React.ReactNode;
  href: string;
}

export default function Sidebar() {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const pathname = usePathname();
  const { user } = useUser();

  const navItems: NavItem[] = [
    {
      id: 'budget',
      label: 'Budget',
      icon: <FaWallet size={20} />,
      href: '/',
    },
    {
      id: 'recurring',
      label: 'Recurring',
      icon: <FaRedo size={20} />,
      href: '/recurring',
    },
    {
      id: 'accounts',
      label: 'Accounts',
      icon: <FaUniversity size={20} />,
      href: '/settings',
    },
    {
      id: 'insights',
      label: 'Insights',
      icon: <FaChartLine size={20} />,
      href: '/insights',
    },
  ];

  const isActive = (href: string) => {
    if (href === '/') return pathname === '/';
    return pathname.startsWith(href);
  };

  return (
    <div
      className={`bg-sidebar-bg text-white flex flex-col transition-all duration-300 ${
        isCollapsed ? 'w-16' : 'w-64'
      }`}
    >
      {/* Logo/Header */}
      <div className="h-16 flex items-center justify-between px-4 border-b border-sidebar-border">
        {!isCollapsed && (
          <span className="text-xl font-bold text-white">BudgetApp</span>
        )}
        <button
          onClick={() => setIsCollapsed(!isCollapsed)}
          className={`p-2 hover:bg-sidebar-hover rounded-lg transition-colors ${
            isCollapsed ? 'mx-auto' : ''
          }`}
          title={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {isCollapsed ? <FaChevronRight size={14} /> : <FaChevronLeft size={14} />}
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-4">
        <ul className="space-y-1 px-2">
          {navItems.map((item) => (
            <li key={item.id}>
              <Link
                href={item.href}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors ${
                  isActive(item.href)
                    ? 'bg-primary text-white'
                    : 'text-sidebar-text-muted hover:bg-sidebar-hover hover:text-white'
                }`}
                title={isCollapsed ? item.label : undefined}
              >
                <span className="flex-shrink-0">{item.icon}</span>
                {!isCollapsed && <span className="font-medium">{item.label}</span>}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      {/* Help */}
      <div className="px-2 mb-2">
        <Link
          href="/onboarding"
          className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors ${
            isActive('/onboarding')
              ? 'bg-primary text-white'
              : 'text-sidebar-text-muted hover:bg-sidebar-hover hover:text-white'
          }`}
          title={isCollapsed ? 'Getting Started' : undefined}
        >
          <span className="flex-shrink-0"><FaLightbulb size={20} /></span>
          {!isCollapsed && <span className="font-medium">Getting Started</span>}
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
