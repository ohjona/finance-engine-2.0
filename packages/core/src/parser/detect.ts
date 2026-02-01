/**
 * Parser detection from filename.
 * Per PRD Section 8.1.
 *
 * Filename convention: {institution}_{accountID}_{YYYYMM}.{ext}
 * Example: amex_2122_202601.xlsx
 */

import type { ParseResult } from '../types/index.js';
import { parseAmex } from './amex.js';
import { parseChaseChecking } from './chase-checking.js';
import { parseBoaChecking } from './boa-checking.js';
import { parseBoaCredit } from './boa-credit.js';
import { parseFidelity } from './fidelity.js';
import { parseDiscover } from './discover.js';

/**
 * Parser function signature.
 * Takes ArrayBuffer (not file path) to keep core headless.
 */
export type ParserFn = (data: ArrayBuffer, accountId: number, sourceFile: string) => ParseResult;

/**
 * Parser registry entry.
 */
interface ParserEntry {
    /** Regex pattern to match filename */
    pattern: RegExp;
    /** Parser function */
    parser: ParserFn;
}

/**
 * Registry of parsers.
 * Per PRD Section 8.1, filename convention: {institution}_{accountID}_{YYYYMM}.{ext}
 */
const PARSERS: Record<string, ParserEntry> = {
    amex: {
        pattern: /^amex_\d{4}_\d{6}\.xlsx$/i,
        parser: parseAmex,
    },
    chase_checking: {
        pattern: /^chase_checking_\d{4}_\d{6}\.csv$/i,
        parser: parseChaseChecking,
    },
    boa_checking: {
        pattern: /^boa_checking_\d{4}_\d{6}\.csv$/i,
        parser: parseBoaChecking,
    },
    boa_credit: {
        pattern: /^boa_credit_\d{4}_\d{6}\.csv$/i,
        parser: parseBoaCredit,
    },
    fidelity: {
        pattern: /^fidelity_\d{4}_\d{6}\.csv$/i,
        parser: parseFidelity,
    },
    discover: {
        pattern: /^discover_\d{4}_\d{6}\.xls$/i,
        parser: parseDiscover,
    },
};

/**
 * Detection result returned by detectParser.
 */
export interface ParserDetectionResult {
    parser: ParserFn;
    accountId: number;
    parserName: string;
}

/**
 * Detect parser for a given filename.
 *
 * Per PRD Section 8.1:
 * - Skip hidden files (start with .)
 * - Skip temp files (start with ~)
 * - Extract account ID from filename
 *
 * @param filename - Base filename (not full path)
 * @returns Detection result or null if no parser matches
 */
export function detectParser(filename: string): ParserDetectionResult | null {
    // Per IK D8.8: Skip hidden and temp files
    if (filename.startsWith('.') || filename.startsWith('~')) {
        return null;
    }

    for (const [name, { pattern, parser }] of Object.entries(PARSERS)) {
        if (pattern.test(filename)) {
            const accountId = extractAccountId(filename);
            if (accountId !== null) {
                return { parser, accountId, parserName: name };
            }
        }
    }

    return null;
}

/**
 * Extract 4-digit account ID from filename.
 * Expected format: {institution}_{accountID}_{YYYYMM}.{ext}
 *
 * @param filename - Filename to parse
 * @returns 4-digit account ID or null if not found
 */
export function extractAccountId(filename: string): number | null {
    const parts = filename.split('_');
    if (parts.length >= 2) {
        const idStr = parts[1];
        if (/^\d{4}$/.test(idStr)) {
            return parseInt(idStr, 10);
        }
    }
    return null;
}

/**
 * Get list of supported parser names.
 */
export function getSupportedParsers(): string[] {
    return Object.keys(PARSERS);
}
