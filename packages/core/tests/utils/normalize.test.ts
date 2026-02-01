import { describe, it, expect } from 'vitest';
import { normalizeDescription } from '../../src/utils/normalize.js';

describe('normalizeDescription', () => {
    it('converts to uppercase', () => {
        expect(normalizeDescription('uber trip')).toBe('UBER TRIP');
    });

    it('replaces * with space', () => {
        expect(normalizeDescription('UBER*TRIP')).toBe('UBER TRIP');
    });

    it('replaces # with space', () => {
        expect(normalizeDescription('STORE#123')).toBe('STORE 123');
    });

    it('collapses multiple spaces', () => {
        expect(normalizeDescription('UBER   TRIP')).toBe('UBER TRIP');
    });

    it('trims leading and trailing whitespace', () => {
        expect(normalizeDescription('  UBER TRIP  ')).toBe('UBER TRIP');
    });

    it('handles complex real-world descriptions', () => {
        expect(normalizeDescription('UBER *TRIP HELP.UBER.COM')).toBe('UBER TRIP HELP.UBER.COM');
        expect(normalizeDescription('AMZN*1A2B3C4D5E AMZN.COM/BILL')).toBe(
            'AMZN 1A2B3C4D5E AMZN.COM/BILL'
        );
    });

    it('handles empty string', () => {
        expect(normalizeDescription('')).toBe('');
    });

    it('handles string with only special characters', () => {
        expect(normalizeDescription('***###')).toBe('');
    });

    it('preserves other punctuation', () => {
        expect(normalizeDescription('HELP.UBER.COM')).toBe('HELP.UBER.COM');
        expect(normalizeDescription('AMAZON-PRIME')).toBe('AMAZON-PRIME');
    });
});
