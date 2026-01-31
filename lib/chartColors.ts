import { CategoryType } from '@/types/budget';

// Category color mapping using design system colors
export const categoryColorMap: Record<CategoryType, string> = {
  income: '#059669',        // primary
  giving: '#9333ea',        // accent-purple
  household: '#2563eb',     // info
  transportation: '#0891b2', // cyan-600
  food: '#16a34a',          // success
  personal: '#f97316',      // accent-orange
  insurance: '#eab308',     // warning
  saving: '#10b981',        // emerald-500
};

// Light color variants for backgrounds and highlights
export const categoryLightMap: Record<CategoryType, string> = {
  income: '#ecfdf5',        // primary-light
  giving: '#faf5ff',        // accent-purple-light
  household: '#eff6ff',     // info-light
  transportation: '#ecfeff', // cyan-50
  food: '#f0fdf4',          // success-light
  personal: '#fff7ed',      // accent-orange-light
  insurance: '#fefce8',     // warning-light
  saving: '#d1fae5',        // emerald-100
};

// Category emoji mapping (from design system)
export const categoryEmojiMap: Record<CategoryType, string> = {
  income: '💰',
  giving: '🤲',
  household: '🏠',
  transportation: '🚗',
  food: '🍽️',
  personal: '👤',
  insurance: '🛡️',
  saving: '💵',
};

/**
 * Get the primary color for a category
 */
export function getCategoryColor(categoryKey: CategoryType): string {
  return categoryColorMap[categoryKey] || '#6b7280'; // fallback to gray-500
}

/**
 * Get the light variant color for a category
 */
export function getCategoryLightColor(categoryKey: CategoryType): string {
  return categoryLightMap[categoryKey] || '#f3f4f6'; // fallback to gray-100
}

/**
 * Get the emoji for a category
 */
export function getCategoryEmoji(categoryKey: CategoryType): string {
  return categoryEmojiMap[categoryKey] || '📊';
}
