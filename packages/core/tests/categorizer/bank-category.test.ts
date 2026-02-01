import { describe, it, expect } from 'vitest';
import {
    guessFromBankCategory,
    DEFAULT_BANK_CATEGORY_MAP,
} from '../../src/categorizer/bank-category.js';
import type { BankCategoryMap } from '../../src/categorizer/types.js';

describe('guessFromBankCategory', () => {
    const testMap: BankCategoryMap = {
        'RESTAURANT': 4320,
        'RESTAURANTS': 4320,
        'TRANSPORTATION': 4260,
        'GROCERIES': 4310,
        'SUPERMARKETS': 4310,
    };

    it('returns null with default empty map', () => {
        expect(guessFromBankCategory('Restaurant')).toBeNull();
    });

    it('matches exact category (case-insensitive)', () => {
        expect(guessFromBankCategory('RESTAURANT', testMap)).toBe(4320);
        expect(guessFromBankCategory('restaurant', testMap)).toBe(4320);
        expect(guessFromBankCategory('Restaurant', testMap)).toBe(4320);
    });

    it('matches partial category', () => {
        // "TRANSPORTATION-TAXI" contains "TRANSPORTATION"
        expect(guessFromBankCategory('Transportation-Taxi', testMap)).toBe(4260);
    });

    it('returns null for unmapped category', () => {
        expect(guessFromBankCategory('Entertainment', testMap)).toBeNull();
    });

    it('returns null for empty string', () => {
        expect(guessFromBankCategory('', testMap)).toBeNull();
    });

    it('returns null for undefined-like input', () => {
        expect(guessFromBankCategory('', testMap)).toBeNull();
    });

    it('handles whitespace in category', () => {
        expect(guessFromBankCategory('  RESTAURANT  ', testMap)).toBe(4320);
    });
});

describe('DEFAULT_BANK_CATEGORY_MAP', () => {
    it('is empty for Phase 3', () => {
        expect(Object.keys(DEFAULT_BANK_CATEGORY_MAP).length).toBe(0);
    });
});
