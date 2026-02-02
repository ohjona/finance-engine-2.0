import { detectWorkspaceRoot } from '../workspace/detect.js';
import { resolveWorkspace } from '../workspace/paths.js';
import { loadAccounts } from '../workspace/config.js';
import { runPipeline } from '../pipeline/runner.js';
import { log, success, warn, arrow } from '../utils/console.js';
import type { ProcessOptions } from '../types.js';

export async function processMonth(month: string, options: ProcessOptions): Promise<void> {
    log(`\nFinance Engine 2.0 - Processing ${month}`);

    // 1. Workspace detection
    arrow('Detecting workspace...');
    const root = options.workspace || detectWorkspaceRoot();
    if (!root) {
        console.error('\n✖ Error: Workspace not found. Are you in a Finance Engine project?');
        console.error('Expected "config/user-rules.yaml" in the workspace root.');
        process.exit(1);
    }
    const workspace = resolveWorkspace(root);
    success(`Workspace: ${workspace.root}`);

    // 2. Validate month format (S-10)
    const monthMatch = month.match(/^(\d{4})-(\d{2})$/);
    if (!monthMatch) {
        console.error('\n✖ Error: Invalid month format. Use YYYY-MM (e.g., 2026-01).');
        process.exit(1);
    }
    const m = parseInt(monthMatch[2], 10);
    if (m < 1 || m > 12) {
        console.error(`\n✖ Error: Invalid month "${monthMatch[2]}". Must be between 01 and 12.`);
        process.exit(1);
    }

    // 3. Load Chart of Accounts
    let accounts;
    try {
        accounts = loadAccounts(workspace);
    } catch (err) {
        console.error(`\n✖ Error: Failed to load Chart of Accounts. ${(err as Error).message}`);
        process.exit(1);
    }

    // 4. Run Pipeline
    const state = await runPipeline(month, workspace, accounts, options);

    // 4. Report Final Status
    log('\n--- Processing Summary ---');

    if (state.warnings.length > 0) {
        for (const w of state.warnings) {
            warn(w);
        }
    }

    if (state.errors.length > 0) {
        for (const e of state.errors) {
            console.error(`✖ ERROR [${e.step}]: ${e.message}`);
        }
        if (state.errors.some(e => e.fatal)) {
            log('\n✖ Processing failed with fatal errors.');
            process.exit(1);
        }
    }

    success(`Processing complete for ${month}.`);
    arrow(`Total transactions: ${state.transactions.length}`);
    if (state.categorizationStats) {
        arrow(`Needs review: ${state.categorizationStats.needsReview}`);
    }

    if (!state.options.dryRun) {
        arrow(`Outputs saved to: ${workspace.outputs}/${month}`);
    } else {
        log('\n[DRY RUN] No files were written or archived.');
    }
}
