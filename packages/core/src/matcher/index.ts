/**
 * Matcher module: Payment matching between bank and CC transactions.
 * Per PRD §10, IK D6.1-D6.9.
 */

export { matchPayments } from './match-payments.js';
export { findBestMatch } from './find-best-match.js';
export { daysBetween, isWithinDateTolerance } from './date-diff.js';
export type { MatcherOptions, MatchCandidate, BestMatchResult } from './types.js';
