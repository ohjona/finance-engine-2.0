/**
 * Date parsing utilities for transaction parsers.
 * All dates returned as UTC (00:00:00Z).
 */

/**
 * Parse date value (Excel serial, Date object, or string).
 * Returns date in UTC (00:00:00Z).
 */
export function parseDateValue(value: unknown, format: 'MDY' | 'ISO'): Date | null {
    if (value instanceof Date) {
        return isValidDate(value) ? value : null;
    }
    if (typeof value === 'number') {
        // Excel serial date
        return excelSerialToDate(value);
    }

    if (typeof value === 'string') {
        if (format === 'MDY') {
            return parseMdyDate(value);
        } else {
            return parseIsoDate(value);
        }
    }

    return null;
}

/**
 * Parse MM/DD/YYYY date string to Date (UTC).
 */
export function parseMdyDate(value: string): Date | null {
    const match = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (!match) return null;

    const month = parseInt(match[1]);
    const day = parseInt(match[2]);
    const year = parseInt(match[3]);

    const date = new Date(Date.UTC(year, month - 1, day));
    if (!isValidDate(date)) return null;

    if (date.getUTCFullYear() !== year ||
        date.getUTCMonth() !== month - 1 ||
        date.getUTCDate() !== day) {
        return null;
    }

    return date;
}

/**
 * Parse YYYY-MM-DD date string to Date (UTC).
 */
export function parseIsoDate(value: string): Date | null {
    const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) return null;

    const year = parseInt(match[1]);
    const month = parseInt(match[2]);
    const day = parseInt(match[3]);

    const date = new Date(Date.UTC(year, month - 1, day));
    if (!isValidDate(date)) return null;

    if (date.getUTCFullYear() !== year ||
        date.getUTCMonth() !== month - 1 ||
        date.getUTCDate() !== day) {
        return null;
    }

    return date;
}

/**
 * Convert Excel serial date to JavaScript Date (UTC).
 */
export function excelSerialToDate(serial: number): Date {
    // Excel serial: days since 1899-12-30
    // If there's a fractional part (time), it might be due to timezone shifts during conversion.
    // For bank exports, we almost always want the date at 00:00:00 UTC.
    // We round to the nearest day to handle small fractional offsets from timezone shifts.
    const days = Math.round(serial);
    const utcDays = days - 25569; // Adjust to Unix epoch
    const utcMs = utcDays * 86400 * 1000;
    return new Date(utcMs);
}

/**
 * Format Date as ISO YYYY-MM-DD string (UTC).
 */
export function formatIsoDate(date: Date): string {
    const year = date.getUTCFullYear();
    const month = String(date.getUTCMonth() + 1).padStart(2, '0');
    const day = String(date.getUTCDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

/**
 * Check if date is valid.
 */
export function isValidDate(date: Date): boolean {
    return !isNaN(date.getTime());
}
