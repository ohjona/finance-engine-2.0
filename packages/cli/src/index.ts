#!/usr/bin/env node
/**
 * Finance Engine CLI - Phase 1 Proof of Concept
 *
 * This minimal CLI demonstrates the headless core architecture:
 * - CLI handles all file I/O (uses node:fs)
 * - Core receives ArrayBuffer, returns ParseResult
 * - Core has no file system access, no console.* calls
 *
 * Full implementation will be added in Phase 5.
 */

import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import { detectParser, resolveCollisions, type ParseResult } from '@finance-engine/core';

async function main() {
    const args = process.argv.slice(2);

    if (args.length === 0) {
        console.log('Finance Engine CLI v2.0.0');
        console.log('');
        console.log('Phase 1 Proof of Concept');
        console.log('Usage: fineng <amex-file.xlsx>');
        console.log('');
        console.log('Example:');
        console.log('  fineng amex_2122_202601.xlsx');
        process.exit(0);
    }

    const filePath = args[0];
    const filename = basename(filePath);

    // Detect parser from filename
    const detection = detectParser(filename);
    if (!detection) {
        console.error(`Error: No parser found for file: ${filename}`);
        console.error('Expected format: {institution}_{accountID}_{YYYYMM}.{ext}');
        console.error('Example: amex_2122_202601.xlsx');
        process.exit(1);
    }

    console.log(`Detected parser: ${detection.parserName}`);
    console.log(`Account ID: ${detection.accountId}`);
    console.log('');

    // CLI handles file I/O - reads file to ArrayBuffer
    let fileBuffer: Buffer;
    try {
        fileBuffer = readFileSync(filePath);
    } catch (err) {
        console.error(`Error reading file: ${(err as Error).message}`);
        process.exit(1);
    }

    const arrayBuffer = fileBuffer.buffer.slice(
        fileBuffer.byteOffset,
        fileBuffer.byteOffset + fileBuffer.byteLength
    ) as ArrayBuffer;

    // Core receives ArrayBuffer, returns ParseResult (no I/O in core)
    let result: ParseResult;
    try {
        result = detection.parser(arrayBuffer, detection.accountId, filename);
    } catch (err) {
        console.error(`Error parsing file: ${(err as Error).message}`);
        process.exit(1);
    }

    // CLI handles warnings from core (core doesn't log them)
    for (const warning of result.warnings) {
        console.warn(`Warning: ${warning}`);
    }

    // Handle collisions (pure function, returns new array)
    const transactions = resolveCollisions(result.transactions);

    console.log(`Parsed ${transactions.length} transactions:`);
    console.log('');

    // Display transactions
    for (const txn of transactions) {
        const amount = txn.signed_amount.padStart(10);
        const desc = txn.description.slice(0, 40).padEnd(40);
        console.log(`${txn.effective_date} | ${amount} | ${desc}`);
    }

    console.log('');
    console.log(`Skipped rows: ${result.skippedRows}`);
    console.log('');
    console.log('✓ Phase 1 PoC complete - headless core architecture verified.');
}

main().catch((err) => {
    console.error('Unexpected error:', err.message);
    process.exit(1);
});
