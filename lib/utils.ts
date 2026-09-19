/**
 * Safely format epoch milliseconds (number or numeric string) to a localized date string.
 * Returns "Unknown" for invalid/null/undefined values instead of "Invalid Date".
 */
export function formatTimestamp(
  timestamp: number | string | null | undefined,
  format: 'locale' | 'date' | 'iso' = 'locale'
): string {
  if (timestamp == null) return 'Unknown';
  
  const numericTimestamp = typeof timestamp === 'string' ? parseInt(timestamp, 10) : timestamp;
  
  if (isNaN(numericTimestamp) || numericTimestamp <= 0) return 'Unknown';
  
  try {
    const date = new Date(numericTimestamp);
    if (isNaN(date.getTime())) return 'Unknown';
    
    switch (format) {
      case 'date':
        return date.toLocaleDateString();
      case 'iso':
        return date.toISOString();
      case 'locale':
      default:
        return date.toLocaleString();
    }
  } catch {
    return 'Unknown';
  }
}
