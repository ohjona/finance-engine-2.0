import { describe, it, expect } from 'vitest';
import { detectParser, extractAccountId, getSupportedParsers } from '../../src/parser/detect.js';

describe('detectParser', () => {
    it('detects Amex parser from valid filename', () => {
        const result = detectParser('amex_2122_202601.xlsx');

        expect(result).not.toBeNull();
        expect(result!.parserName).toBe('amex');
        expect(result!.accountId).toBe(2122);
        expect(typeof result!.parser).toBe('function');
    });

    it('detects Chase Checking parser from valid filename', () => {
        const result = detectParser('chase_checking_1120_202601.csv');

        expect(result).not.toBeNull();
        expect(result!.parserName).toBe('chase_checking');
        expect(result!.accountId).toBe(1120);
        expect(typeof result!.parser).toBe('function');
    });

    it('detects BoA Checking parser from valid filename', () => {
        const result = detectParser('boa_checking_1110_202601.csv');

        expect(result).not.toBeNull();
        expect(result!.parserName).toBe('boa_checking');
        expect(result!.accountId).toBe(1110);
        expect(typeof result!.parser).toBe('function');
    });

    it('detects BoA Credit parser from valid filename', () => {
        const result = detectParser('boa_credit_2110_202601.csv');

        expect(result).not.toBeNull();
        expect(result!.parserName).toBe('boa_credit');
        expect(result!.accountId).toBe(2110);
        expect(typeof result!.parser).toBe('function');
    });

    it('detects Fidelity parser from valid filename', () => {
        const result = detectParser('fidelity_2180_202601.csv');

        expect(result).not.toBeNull();
        expect(result!.parserName).toBe('fidelity');
        expect(result!.accountId).toBe(2180);
        expect(typeof result!.parser).toBe('function');
    });

    it('detects Discover parser from valid filename', () => {
        const result = detectParser('discover_2170_202601.xls');

        expect(result).not.toBeNull();
        expect(result!.parserName).toBe('discover');
        expect(result!.accountId).toBe(2170);
        expect(typeof result!.parser).toBe('function');
    });

    it('detects parsers case-insensitively', () => {
        expect(detectParser('AMEX_2122_202601.XLSX')?.parserName).toBe('amex');
        expect(detectParser('CHASE_CHECKING_1120_202601.CSV')?.parserName).toBe('chase_checking');
        expect(detectParser('BOA_CHECKING_1110_202601.CSV')?.parserName).toBe('boa_checking');
        expect(detectParser('BOA_CREDIT_2110_202601.CSV')?.parserName).toBe('boa_credit');
        expect(detectParser('FIDELITY_2180_202601.CSV')?.parserName).toBe('fidelity');
        expect(detectParser('DISCOVER_2170_202601.XLS')?.parserName).toBe('discover');
    });

    it('returns null for hidden files', () => {
        expect(detectParser('.DS_Store')).toBeNull();
        expect(detectParser('.gitkeep')).toBeNull();
    });

    it('returns null for temp files', () => {
        expect(detectParser('~$amex_2122_202601.xlsx')).toBeNull();
    });

    it('returns null for unrecognized files', () => {
        expect(detectParser('unknown_file.csv')).toBeNull();
        expect(detectParser('random.txt')).toBeNull();
    });

    it('returns null for invalid account ID format', () => {
        expect(detectParser('amex_12_202601.xlsx')).toBeNull(); // Too short
        expect(detectParser('amex_12345_202601.xlsx')).toBeNull(); // Too long
        expect(detectParser('amex_abcd_202601.xlsx')).toBeNull(); // Not numeric
    });

    describe('backward compatibility and disambiguation', () => {
        it('detects Chase from shortened filename', () => {
            const result = detectParser('chase_1120_202601.csv');
            expect(result?.parserName).toBe('chase_checking');
        });

        it('disambiguates BoA Checking from account ID range (1xxx)', () => {
            const result = detectParser('boa_1110_202601.csv');
            expect(result?.parserName).toBe('boa_checking');
        });

        it('disambiguates BoA Credit from account ID range (2xxx)', () => {
            const result = detectParser('boa_2110_202601.csv');
            expect(result?.parserName).toBe('boa_credit');
        });

        it('returns null for BoA filename with unknown account range', () => {
            expect(detectParser('boa_9999_202601.csv')).toBeNull();
        });
    });
});

describe('extractAccountId', () => {
    it('extracts 4-digit account ID from simple format', () => {
        expect(extractAccountId('amex_2122_202601.xlsx')).toBe(2122);
        expect(extractAccountId('fidelity_2180_202601.csv')).toBe(2180);
        expect(extractAccountId('discover_2170_202601.xls')).toBe(2170);
    });

    it('extracts 4-digit account ID from extended format', () => {
        expect(extractAccountId('chase_checking_1120_202601.csv')).toBe(1120);
        expect(extractAccountId('boa_checking_1110_202601.csv')).toBe(1110);
        expect(extractAccountId('boa_credit_2110_202601.csv')).toBe(2110);
    });

    it('returns null for invalid formats', () => {
        expect(extractAccountId('invalid')).toBeNull();
        expect(extractAccountId('amex_12_202601.xlsx')).toBeNull();
        expect(extractAccountId('amex_12345_202601.xlsx')).toBeNull();
        expect(extractAccountId('no_numbers_here.csv')).toBeNull();
    });
});

describe('getSupportedParsers', () => {
    it('returns list of all 6 parser names', () => {
        const parsers = getSupportedParsers();
        expect(parsers).toContain('amex');
        expect(parsers).toContain('chase_checking');
        expect(parsers).toContain('boa_checking');
        expect(parsers).toContain('boa_credit');
        expect(parsers).toContain('fidelity');
        expect(parsers).toContain('discover');
        expect(parsers.length).toBe(6);
    });
});
