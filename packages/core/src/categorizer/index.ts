/**
 * Categorizer module: Automated transaction categorization.
 */

export { categorize } from './categorize.js';
export { validatePattern, checkPatternCollision } from './validate.js';
export { matchesPattern } from './match.js';
export { guessFromBankCategory } from './bank-category.js';
export type { CategorizeOptions, CategorizationStats, BankCategoryMap } from './types.js';
