/**
 * Date arithmetic utilities using native Date.
 * No date-fns dependency per design decision.
 */

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Calculate absolute days between two ISO date strings.
 *
 * @param date1 - ISO date string (YYYY-MM-DD)
 * @param date2 - ISO date string (YYYY-MM-DD)
 * @returns Absolute difference in days
 */
export function daysBetween(date1: string, date2: string): number {
    const d1 = new Date(date1 + 'T00:00:00Z');
    const d2 = new Date(date2 + 'T00:00:00Z');
    const diff = Math.abs(d1.getTime() - d2.getTime());
    return Math.round(diff / MS_PER_DAY);
}

/**
 * Check if two dates are within tolerance.
 *
 * @param date1 - ISO date string
 * @param date2 - ISO date string
 * @param toleranceDays - Maximum allowed difference
 * @returns true if within tolerance (inclusive)
 */
export function isWithinDateTolerance(
    date1: string,
    date2: string,
    toleranceDays: number
): boolean {
    return daysBetween(date1, date2) <= toleranceDays;
}
