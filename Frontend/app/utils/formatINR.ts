/**
 * Formats a numeric value as Indian Rupee (INR) currency.
 * Uses Intl.NumberFormat with en-IN locale for proper Indian
 * number grouping (e.g. ₹1,20,000 / ₹5,49,999 / ₹999.00).
 */
export function formatINR(value: number | string | null | undefined): string {
  const num = Number(value ?? 0);
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(num);
}

/**
 * Short version without decimal places — for display-only contexts
 * where fractional paise is not needed.
 */
export function formatINRShort(value: number | string | null | undefined): string {
  const num = Number(value ?? 0);
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(num);
}

