/**
 * Joins class names, skipping falsy values.
 * Note: does not resolve conflicting Tailwind utilities (no tailwind-merge) —
 * avoid passing a class that duplicates a utility already set by a component.
 */
export function cn(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(' ');
}
