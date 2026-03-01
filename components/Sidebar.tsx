'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import Image from 'next/image';
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
  FaWifi,
  FaSync,
  FaBan,
} from 'react-icons/fa';
import { api } from '@/lib/api-client';
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
  const [syncStatus, setSyncStatus] = useState<{
    state: string;
    pendingCount: number;
    lastError: string | null;
    enabled: boolean;
  } | null>(null);
  const [syncing, setSyncing] = useState(false);

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

  // Poll sync status
  const fetchSyncStatus = useCallback(async () => {
    try {
      const s = await api.supabase.getStatus();
      setSyncStatus(s);
    } catch {
      // Supabase not configured — ignore
    }
  }, []);

  useEffect(() => {
    fetchSyncStatus();
    const interval = setInterval(fetchSyncStatus, 15000);
    return () => clearInterval(interval);
  }, [fetchSyncStatus]);

  const handleSync = async () => {
    setSyncing(true);
    try {
      await api.supabase.sync();
      await fetchSyncStatus();
    } catch {
      await fetchSyncStatus();
    } finally {
      setSyncing(false);
    }
  };

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
        {!isCollapsed ? (
          <div className="flex items-center gap-2">
            <Image
              src="/Budget_logo.png"
              alt="Budget App"
              width={36}
              height={36}
              className="rounded"
            />
            <span className="text-xl font-bold text-white">BudgetApp</span>
          </div>
        ) : (
          <button
            onClick={() => setIsCollapsed(false)}
            className="mx-auto hover:opacity-80 transition-opacity"
            title="Expand sidebar"
          >
            <Image
              src="/Budget_logo.png"
              alt="Budget App"
              width={32}
              height={32}
              className="rounded"
            />
          </button>
        )}
        {!isCollapsed && (
          <button
            onClick={() => setIsCollapsed(true)}
            className="p-2 hover:bg-sidebar-hover rounded-lg transition-colors"
            title="Collapse sidebar"
          >
            <FaChevronLeft size={14} />
          </button>
        )}
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

      {/* Sync Status */}
      {syncStatus?.enabled && syncStatus.state !== 'disabled' && (
        <div className="border-t border-sidebar-border px-3 py-2">
          <div className="flex items-center gap-2">
            <SyncIndicator state={syncing ? 'syncing' : syncStatus.state} />
            {!isCollapsed && (
              <span className="text-xs text-sidebar-text-muted truncate flex-1">
                {syncing
                  ? 'Syncing...'
                  : syncStatus.state === 'idle'
                  ? `Synced${syncStatus.pendingCount > 0 ? ` (${syncStatus.pendingCount})` : ''}`
                  : syncStatus.state === 'error'
                  ? 'Sync error'
                  : syncStatus.state === 'offline'
                  ? 'Offline'
                  : 'Syncing...'}
              </span>
            )}
            <button
              onClick={handleSync}
              disabled={syncing}
              className="p-1 rounded hover:bg-sidebar-hover transition-colors"
              title="Sync now"
            >
              <FaSync className={`w-3 h-3 text-sidebar-text-muted ${syncing ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>
      )}

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
              <p className="text-xs text-text-tertiary">Version {process.env.NEXT_PUBLIC_APP_VERSION}</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function SyncIndicator({ state }: { state: string }) {
  switch (state) {
    case 'idle':
      return <FaWifi className="w-3.5 h-3.5 text-green-400 shrink-0" />;
    case 'syncing':
      return <FaSync className="w-3.5 h-3.5 text-blue-400 animate-spin shrink-0" />;
    case 'offline':
    case 'error':
      return <FaBan className="w-3.5 h-3.5 text-red-400 shrink-0" />;
    default:
      return null;
  }
}
