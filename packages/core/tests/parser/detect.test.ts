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

    it('detects Amex parser case-insensitively', () => {
        const result = detectParser('AMEX_2122_202601.XLSX');
        expect(result).not.toBeNull();
        expect(result!.parserName).toBe('amex');
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
});

describe('extractAccountId', () => {
    it('extracts 4-digit account ID', () => {
        expect(extractAccountId('amex_2122_202601.xlsx')).toBe(2122);
        expect(extractAccountId('chase_1120_202601.csv')).toBe(1120);
        expect(extractAccountId('boa_1110_202601.csv')).toBe(1110);
    });

    it('returns null for invalid formats', () => {
        expect(extractAccountId('invalid')).toBeNull();
        expect(extractAccountId('amex_12_202601.xlsx')).toBeNull();
        expect(extractAccountId('amex_12345_202601.xlsx')).toBeNull();
    });
});

describe('getSupportedParsers', () => {
    it('returns list of parser names', () => {
        const parsers = getSupportedParsers();
        expect(parsers).toContain('amex');
        expect(Array.isArray(parsers)).toBe(true);
    });
});
