'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import {
  FaWallet,
  FaUniversity,
  FaChartLine,
  FaChevronLeft,
  FaChevronRight,
  FaRedo,
  FaLightbulb,
  FaUser,
  FaSun,
  FaMoon,
  FaDesktop,
  FaCheck,
} from 'react-icons/fa';
import { useTheme } from '@/contexts/ThemeContext';

interface NavItem {
  id: string;
  label: string;
  icon: React.ReactNode;
  href: string;
}

export default function Sidebar() {
  const [isCollapsed, setIsCollapsed] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth < 1024 : false
  );
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);
  const { theme, setTheme } = useTheme();

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 1023px)');
    const handler = (e: MediaQueryListEvent) => setIsCollapsed(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(event.target as Node)) {
        setIsUserMenuOpen(false);
      }
    };

    if (isUserMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isUserMenuOpen]);

  const pathname = usePathname();
  const searchParams = useSearchParams();

  const monthParam = searchParams.get('month');
  const yearParam = searchParams.get('year');
  const monthYearQuery = monthParam !== null && yearParam !== null ? `?month=${monthParam}&year=${yearParam}` : '';

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

  const themeOptions = [
    { value: 'light' as const, label: 'Light', icon: <FaSun size={14} /> },
    { value: 'dark' as const, label: 'Dark', icon: <FaMoon size={14} /> },
    { value: 'system' as const, label: 'System', icon: <FaDesktop size={14} /> },
  ];

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
                href={`${item.href}${monthYearQuery}`}
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

      {/* Footer - Local User with Menu */}
      <div className={`relative p-4 border-t border-sidebar-border ${isCollapsed ? 'flex justify-center' : ''}`} ref={userMenuRef}>
        <button
          onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
          className={`flex items-center w-full rounded-lg hover:bg-sidebar-hover transition-colors p-1 -m-1 ${isCollapsed ? '' : 'gap-3'}`}
          title={isCollapsed ? 'User options' : undefined}
        >
          <div className="h-8 w-8 rounded-full bg-primary flex items-center justify-center flex-shrink-0">
            <FaUser size={14} className="text-white" />
          </div>
          {!isCollapsed && (
            <span className="text-sm text-sidebar-text-muted">Local User</span>
          )}
        </button>

        {/* User Options Menu */}
        {isUserMenuOpen && (
          <div
            className={`absolute bottom-full mb-2 bg-surface rounded-lg shadow-xl border border-border overflow-hidden z-50 ${
              isCollapsed ? 'left-full ml-2 bottom-0 mb-0' : 'left-4 right-4'
            }`}
            style={{ minWidth: isCollapsed ? '200px' : undefined }}
          >
            {/* Dark Mode Section */}
            <div className="p-3 border-b border-border">
              <p className="text-xs font-semibold text-text-tertiary uppercase tracking-wide mb-2">
                Appearance
              </p>
              <div className="space-y-1">
                {themeOptions.map((option) => (
                  <button
                    key={option.value}
                    onClick={() => {
                      setTheme(option.value);
                    }}
                    className={`flex items-center justify-between w-full px-3 py-2 rounded-md text-sm transition-colors ${
                      theme === option.value
                        ? 'bg-primary-light text-primary'
                        : 'text-text-secondary hover:bg-surface-secondary'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      {option.icon}
                      <span>{option.label}</span>
                    </div>
                    {theme === option.value && <FaCheck size={12} />}
                  </button>
                ))}
              </div>
            </div>

            {/* Version info */}
            <div className="px-3 py-2">
              <p className="text-xs text-text-tertiary">Version 1.7.0</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
