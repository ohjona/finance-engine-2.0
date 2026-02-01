import { describe, it, expect } from 'vitest';
import { parseMdyDate, parseIsoDate, formatIsoDate, isValidDate, parseDateValue, excelSerialToDate } from '../../src/utils/date-parse.js';

describe('date-parse utilities', () => {
    describe('parseMdyDate', () => {
        it('should parse valid MM/DD/YYYY', () => {
            const date = parseMdyDate('01/15/2026');
            expect(date).not.toBeNull();
            expect(date?.getUTCFullYear()).toBe(2026);
            expect(date?.getUTCMonth()).toBe(0); // Jan
            expect(date?.getUTCDate()).toBe(15);
        });

        it('should return null for invalid format', () => {
            expect(parseMdyDate('2026-01-15')).toBeNull();
            expect(parseMdyDate('01-15-2026')).toBeNull();
            expect(parseMdyDate('1/1/26')).toBeNull();
        });

        it('should return null for invalid dates', () => {
            expect(parseMdyDate('13/01/2026')).toBeNull();
            expect(parseMdyDate('01/32/2026')).toBeNull();
        });
    });

    describe('parseIsoDate', () => {
        it('should parse valid YYYY-MM-DD', () => {
            const date = parseIsoDate('2026-01-15');
            expect(date).not.toBeNull();
            expect(date?.getUTCFullYear()).toBe(2026);
            expect(date?.getUTCMonth()).toBe(0);
            expect(date?.getUTCDate()).toBe(15);
        });

        it('should return null for invalid format', () => {
            expect(parseIsoDate('01/15/2026')).toBeNull();
        });
    });

    describe('formatIsoDate', () => {
        it('should format date to YYYY-MM-DD', () => {
            const date = new Date(Date.UTC(2026, 0, 15));
            expect(formatIsoDate(date)).toBe('2026-01-15');
        });
    });

    describe('isValidDate', () => {
        it('should return true for valid date', () => {
            expect(isValidDate(new Date())).toBe(true);
        });

        it('should return false for invalid date', () => {
            expect(isValidDate(new Date('invalid'))).toBe(false);
        });
    });

    describe('parseDateValue', () => {
        it('should handle Date objects', () => {
            const d = new Date(Date.UTC(2026, 0, 15));
            expect(parseDateValue(d, 'MDY')).toEqual(d);
        });

        it('should handle Excel serial numbers', () => {
            const d = parseDateValue(46037, 'MDY'); // 2026-01-15
            expect(formatIsoDate(d!)).toBe('2026-01-15');
        });

        it('should handle MDY strings', () => {
            const d = parseDateValue('01/15/2026', 'MDY');
            expect(formatIsoDate(d!)).toBe('2026-01-15');
        });

        it('should handle ISO strings', () => {
            const d = parseDateValue('2026-01-15', 'ISO');
            expect(formatIsoDate(d!)).toBe('2026-01-15');
        });
    });

    describe('excelSerialToDate', () => {
        it('should convert serial to UTC date', () => {
            const d = excelSerialToDate(46037);
            expect(formatIsoDate(d)).toBe('2026-01-15');
            expect(d.getUTCHours()).toBe(0);
        });

        it('should handle fractional serials by rounding', () => {
            // 46036.791666666664 is evening of Jan 14, should round to Jan 15
            const d = excelSerialToDate(46036.791666666664);
            expect(formatIsoDate(d)).toBe('2026-01-15');
        });
    });
});
