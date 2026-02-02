import { detectWorkspaceRoot } from '../workspace/detect.js';
import { resolveWorkspace } from '../workspace/paths.js';
import { appendRuleToYaml } from '../yaml/rules.js';
import { success, log, arrow } from '../utils/console.js';
import type { AddRuleOptions } from '../types.js';

export async function addRule(pattern: string, category: string, options: AddRuleOptions): Promise<void> {
    const categoryId = parseInt(category, 10);
    if (isNaN(categoryId)) {
        console.error('\n✖ Error: Category must be a numeric ID (e.g. 101).');
        process.exit(1);
    }

    // 1. Workspace detection
    const root = options.workspace || detectWorkspaceRoot();
    if (!root) {
        console.error('\n✖ Error: Workspace not found.');
        process.exit(1);
    }
    const workspace = resolveWorkspace(root);
    const rulesPath = workspace.config.userRulesPath;

    // 2. Perform addition
    log(`\nAdding new rule to: ${rulesPath}`);

    try {
        await appendRuleToYaml(rulesPath, {
            pattern,
            category_id: categoryId,
            note: options.note,
            added_date: new Date().toISOString().split('T')[0]
        });

        success(`Rule successfully added!`);
        arrow(`Pattern:  "${pattern}"`);
        arrow(`Category: ${categoryId}`);
        if (options.note) {
            arrow(`Note:     ${options.note}`);
        }
    } catch (err) {
        console.error(`\n✖ Failed to add rule: ${(err as Error).message}`);
        process.exit(1);
    }
}
