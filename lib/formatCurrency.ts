/**
 * Format a number as currency: $x,xxx.xx
 * Always shows 2 decimal places with comma thousand separators.
 */
export function formatCurrency(amount: number): string {
  return amount.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}
