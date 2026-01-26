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
  FaChevronDown,
  FaChevronUp,
  FaFileAlt
} from 'react-icons/fa';

interface SidebarProps {
  onOpenMonthlyReport?: () => void;
}

interface NavItem {
  id: string;
  label: string;
  icon: React.ReactNode;
  href?: string;
  subItems?: { id: string; label: string; onClick?: () => void; href?: string }[];
}

export default function Sidebar({ onOpenMonthlyReport }: SidebarProps) {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [expandedItems, setExpandedItems] = useState<string[]>(['insights']);
  const pathname = usePathname();

  const navItems: NavItem[] = [
    {
      id: 'budget',
      label: 'Budget',
      icon: <FaWallet size={20} />,
      href: '/',
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
      subItems: [
        {
          id: 'monthly-summary',
          label: 'Monthly Summary',
          onClick: onOpenMonthlyReport,
        },
      ],
    },
  ];

  const toggleExpanded = (itemId: string) => {
    setExpandedItems((prev) =>
      prev.includes(itemId)
        ? prev.filter((id) => id !== itemId)
        : [...prev, itemId]
    );
  };

  const isActive = (href?: string) => {
    if (!href) return false;
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
          {navItems.map((item) => {
            const hasSubItems = item.subItems && item.subItems.length > 0;
            const isItemActive = isActive(item.href);

            return (
            <li key={item.id}>
              {/* Main nav item */}
              {item.href && !hasSubItems ? (
                // Simple link without sub-items
                <Link
                  href={item.href}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors ${
                    isItemActive
                      ? 'bg-blue-600 text-white'
                      : 'text-gray-300 hover:bg-gray-800 hover:text-white'
                  }`}
                  title={isCollapsed ? item.label : undefined}
                >
                  <span className="flex-shrink-0">{item.icon}</span>
                  {!isCollapsed && <span className="font-medium">{item.label}</span>}
                </Link>
              ) : (
                // Item with sub-items (may or may not have href)
                <>
                  <div className="flex items-center">
                    {item.href ? (
                      <Link
                        href={item.href}
                        className={`flex-1 flex items-center gap-3 px-3 py-2.5 rounded-l-lg transition-colors ${
                          isItemActive
                            ? 'bg-blue-600 text-white'
                            : 'text-gray-300 hover:bg-gray-800 hover:text-white'
                        }`}
                        title={isCollapsed ? item.label : undefined}
                      >
                        <span className="flex-shrink-0">{item.icon}</span>
                        {!isCollapsed && <span className="font-medium">{item.label}</span>}
                      </Link>
                    ) : (
                      <button
                        onClick={() => !isCollapsed && toggleExpanded(item.id)}
                        className={`flex-1 flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors ${
                          expandedItems.includes(item.id)
                            ? 'bg-gray-800 text-white'
                            : 'text-gray-300 hover:bg-gray-800 hover:text-white'
                        }`}
                        title={isCollapsed ? item.label : undefined}
                      >
                        <span className="flex-shrink-0">{item.icon}</span>
                        {!isCollapsed && (
                          <>
                            <span className="font-medium flex-1 text-left">{item.label}</span>
                            <span className="text-gray-400">
                              {expandedItems.includes(item.id) ? (
                                <FaChevronUp size={12} />
                              ) : (
                                <FaChevronDown size={12} />
                              )}
                            </span>
                          </>
                        )}
                      </button>
                    )}
                    {/* Expand/collapse button for items with href AND subItems */}
                    {!isCollapsed && item.href && hasSubItems && (
                      <button
                        onClick={() => toggleExpanded(item.id)}
                        className={`px-2 py-2.5 rounded-r-lg transition-colors ${
                          isItemActive
                            ? 'bg-blue-700 text-white'
                            : 'text-gray-400 hover:bg-gray-800 hover:text-white'
                        }`}
                      >
                        {expandedItems.includes(item.id) ? (
                          <FaChevronUp size={12} />
                        ) : (
                          <FaChevronDown size={12} />
                        )}
                      </button>
                    )}
                  </div>

                  {/* Sub-items */}
                  {!isCollapsed && hasSubItems && expandedItems.includes(item.id) && (
                    <ul className="mt-1 ml-4 space-y-1">
                      {item.subItems!.map((subItem) => (
                        <li key={subItem.id}>
                          {subItem.href ? (
                            <Link
                              href={subItem.href}
                              className="flex items-center gap-2 px-3 py-2 rounded-lg text-gray-400 hover:bg-gray-800 hover:text-white transition-colors"
                            >
                              <FaFileAlt size={14} />
                              <span className="text-sm">{subItem.label}</span>
                            </Link>
                          ) : (
                            <button
                              onClick={subItem.onClick}
                              className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-gray-400 hover:bg-gray-800 hover:text-white transition-colors"
                            >
                              <FaFileAlt size={14} />
                              <span className="text-sm">{subItem.label}</span>
                            </button>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </>
              )}
            </li>
            );
          })}
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