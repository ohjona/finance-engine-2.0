import { validatePattern, checkPatternCollision } from '@finance-engine/core';
import { detectWorkspaceRoot } from '../workspace/detect.js';
import { resolveWorkspace } from '../workspace/paths.js';
import { loadRules, loadAccounts } from '../workspace/config.js';
import { appendRuleToYaml } from '../yaml/rules.js';
import { success, log, arrow, warning } from '../utils/console.js';
import type { AddRuleOptions } from '../types.js';

export async function addRule(pattern: string, category: string, options: AddRuleOptions): Promise<void> {
    const categoryId = parseInt(category, 10);
    if (isNaN(categoryId)) {
        console.error('\n✖ Error: Category must be a numeric ID (e.g. 101).');
        process.exit(1);
    }

    // CA-3: Validate pattern length (IK D4.7)
    const validation = validatePattern(pattern);
    if (!validation.valid) {
        console.error(`\n✖ Error: ${validation.errors.join(', ')}`);
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

    // A: Validate category existence (SPEC REQUIREMENT)
    try {
        const accounts = loadAccounts(workspace);
        if (!accounts.accounts[categoryId.toString()]) {
            console.error(`\n✖ Error: Category ID ${categoryId} does not exist in accounts.json.`);
            process.exit(1);
        }
    } catch (err) {
        console.error(`\n✖ Error loading accounts: ${(err as Error).message}`);
        process.exit(1);
    }

    // B: Collision handling (D10.8: Warn but don't block)
    const ruleSet = loadRules(workspace);
    const existingRules = [
        ...ruleSet.user_rules,
        ...ruleSet.shared_rules,
        ...ruleSet.base_rules
    ];

    const collision = checkPatternCollision(pattern, 'substring', existingRules);
    if (collision.hasCollision) {
        warning(`\n⚠️  Pattern collision detected.`);
        log(`  Your pattern "${pattern}" conflicts with existing rule:`);
        log(`  "${collision.collidingPatterns[0]}"`);
        log(`  Proceeding anyway as per spec D10.8.\n`);
    }

    // 2. Perform addition
    log(`Adding new rule to: ${rulesPath}`);

    try {
        await appendRuleToYaml(rulesPath, {
            pattern,
            category_id: categoryId,
            note: options.note,
            added_date: new Date().toISOString().split('T')[0],
            source: 'manual' // SPEC REQUIREMENT
        });

        success(`Rule successfully added!`);
        arrow(`Pattern:  "${pattern}"`);
        arrow(`Category: ${categoryId}`);
        arrow(`Source:   manual`);
        if (options.note) {
            arrow(`Note:     ${options.note}`);
        }
    } catch (err) {
        console.error(`\n✖ Failed to add rule: ${(err as Error).message}`);
        process.exit(1);
    }
}
