import type { AddRuleOptions } from '../types.js';

export async function addRule(pattern: string, category: string, options: AddRuleOptions): Promise<void> {
    console.log(`Adding rule: ${pattern} -> ${category}`);
    console.log(`Options: ${JSON.stringify(options)}`);
}
import { detectWorkspaceRoot } from '../workspace/detect.js';
import { resolveWorkspace } from '../workspace/paths.js';
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

    // 2. Validate month format
    if (!/^\d{4}-\d{2}$/.test(month)) {
        console.error('\n✖ Error: Invalid month format. Use YYYY-MM (e.g., 2026-01).');
        process.exit(1);
    }

    // 3. Run Pipeline
    const state = await runPipeline(month, workspace, options);

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
