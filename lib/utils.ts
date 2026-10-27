import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Format timestamp as "time ago" string with proper error handling
 * @param timestamp - ISO string or date string
 * @returns Formatted time string like "2h ago", "Yesterday", etc.
 */
export function formatTimeAgo(timestamp: string | Date): string {
  if (!timestamp) return 'Unknown';

  try {
    const date = new Date(timestamp);
    const now = new Date();

    // Check if date is valid
    if (isNaN(date.getTime())) return 'Invalid date';

    const diffInMinutes = Math.floor((now.getTime() - date.getTime()) / (1000 * 60));
    const diffInHours = Math.floor(diffInMinutes / 60);
    const diffInDays = Math.floor(diffInHours / 24);

    if (diffInMinutes < 1) return 'Just now';
    if (diffInMinutes < 60) return `${diffInMinutes}m ago`;
    if (diffInHours < 24) return `${diffInHours}h ago`;
    if (diffInDays === 1) return 'Yesterday';
    if (diffInDays < 7) return `${diffInDays}d ago`;

    // For older dates, show full date
    return date.toLocaleDateString('en-US', {
      year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
      month: 'short',
      day: 'numeric',
    });
  } catch (error) {
    console.error('Error formatting time:', error);
    return 'Invalid date';
  }
}

/**
 * Format date for display in specific timezone
 * @param timestamp - ISO string or date string
 * @param options - Intl.DateTimeFormatOptions
 * @returns Formatted date string
 */
export function formatDate(
  timestamp: string | Date,
  options: Intl.DateTimeFormatOptions = {}
): string {
  if (!timestamp) return 'Unknown';

  try {
    const date = new Date(timestamp);
    if (isNaN(date.getTime())) return 'Invalid date';

    const defaultOptions: Intl.DateTimeFormatOptions = {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      ...options,
    };

    return date.toLocaleDateString('en-US', defaultOptions);
  } catch (error) {
    console.error('Error formatting date:', error);
    return 'Invalid date';
  }
}

