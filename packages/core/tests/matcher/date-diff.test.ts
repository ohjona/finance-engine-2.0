import { describe, it, expect } from 'vitest';
import { daysBetween, isWithinDateTolerance } from '../../src/matcher/date-diff.js';

describe('daysBetween', () => {
    it('returns 0 for same day', () => {
        expect(daysBetween('2026-01-15', '2026-01-15')).toBe(0);
    });

    it('calculates correct days within same month', () => {
        expect(daysBetween('2026-01-15', '2026-01-20')).toBe(5);
    });

    it('calculates correct days across months', () => {
        expect(daysBetween('2026-01-30', '2026-02-04')).toBe(5);
    });

    it('handles leap year boundary', () => {
        expect(daysBetween('2024-02-28', '2024-03-01')).toBe(2); // 2024 is leap year
        expect(daysBetween('2025-02-28', '2025-03-01')).toBe(1); // 2025 is not
    });

    it('returns absolute value (order independent)', () => {
        expect(daysBetween('2026-01-20', '2026-01-15')).toBe(5);
        expect(daysBetween('2026-01-15', '2026-01-20')).toBe(5);
    });

    it('handles year boundary', () => {
        expect(daysBetween('2025-12-30', '2026-01-04')).toBe(5);
    });
});

describe('isWithinDateTolerance', () => {
    it('returns true when within tolerance', () => {
        expect(isWithinDateTolerance('2026-01-15', '2026-01-18', 5)).toBe(true);
    });

    it('returns true at exactly tolerance', () => {
        expect(isWithinDateTolerance('2026-01-15', '2026-01-20', 5)).toBe(true);
    });

    it('returns false when beyond tolerance', () => {
        expect(isWithinDateTolerance('2026-01-15', '2026-01-21', 5)).toBe(false);
    });

    it('returns true for same day', () => {
        expect(isWithinDateTolerance('2026-01-15', '2026-01-15', 5)).toBe(true);
    });
});
