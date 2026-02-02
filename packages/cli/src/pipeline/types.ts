import type {
    Transaction,
    ParseResult,
    MatchResult,
    LedgerResult,
} from '@finance-engine/shared';
import type { CategorizationStats } from '@finance-engine/core';
import type { Workspace, ProcessOptions } from '../types.js';

/**
 * Metadata for an input file discovered in the imports directory.
 */
export interface InputFile {
    path: string;
    filename: string;
    hash: string;
    parserName?: string;
    accountId?: number;
}

/**
 * Representation of an error occurring within a pipeline step.
 */
export interface PipelineError {
    step: string;
    message: string;
    fatal: boolean;
    error?: unknown;
}

/**
 * Central state object passed through the 10-step processing pipeline.
 * Per Chief Architect's State Object Pattern spec.
 */
export interface PipelineState {
    month: string;
    workspace: Workspace;
    options: ProcessOptions;

    // Accumulated during pipeline execution
    files: InputFile[];
    parseResults: ParseResult[];
    transactions: Transaction[];
    categorizationStats?: CategorizationStats;
    matchResult?: MatchResult;
    ledgerResult?: LedgerResult;

    warnings: string[];
    errors: PipelineError[];
}

/**
 * Function signature for a discrete pipeline step.
 */
export type PipelineStep = (state: PipelineState) => Promise<PipelineState>;
