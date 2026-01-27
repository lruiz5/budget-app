'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  FaWallet,
  FaUniversity,
  FaChartLine,
  FaChevronLeft,
  FaChevronRight,
  FaRedo,
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
      className={`bg-gray-900 text-white flex flex-col transition-all duration-300 ${
        isCollapsed ? 'w-16' : 'w-64'
      }`}
    >
      {/* Logo/Header */}
      <div className="h-16 flex items-center justify-between px-4 border-b border-gray-800">
        {!isCollapsed && (
          <span className="text-xl font-bold text-white">BudgetApp</span>
        )}
        <button
          onClick={() => setIsCollapsed(!isCollapsed)}
          className={`p-2 hover:bg-gray-800 rounded-lg transition-colors ${
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
                    ? 'bg-blue-600 text-white'
                    : 'text-gray-300 hover:bg-gray-800 hover:text-white'
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

      {/* Footer */}
      {!isCollapsed && (
        <div className="p-4 border-t border-gray-800">
          <p className="text-xs text-gray-500 text-center">
            Budget Tracker v1.0
          </p>
        </div>
      )}
    </div>
  );
}
