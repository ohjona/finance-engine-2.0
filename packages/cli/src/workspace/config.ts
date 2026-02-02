import { readFileSync, existsSync } from 'node:fs';
import { parse } from 'yaml';
import {
    ChartOfAccountsSchema,
    RuleSetSchema,
    RuleSchema,
    type ChartOfAccounts,
    type RuleSet,
    type Rule
} from '@finance-engine/shared';
import type { Workspace } from '../types.js';

/**
 * Loads the chart of accounts (accounts.json).
 */
export function loadAccounts(workspace: Workspace): ChartOfAccounts {
    const path = workspace.config.accountsPath;
    if (!existsSync(path)) {
        throw new Error(`Accounts file not found: ${path}`);
    }
    const content = readFileSync(path, 'utf-8');
    const data = JSON.parse(content);
    return ChartOfAccountsSchema.parse(data);
}

/**
 * Loads all categorization rules from the 3-layer hierarchy.
 */
export function loadRules(workspace: Workspace): RuleSet {
    const userRules = loadYamlRules(workspace.config.userRulesPath);
    const baseRules = loadYamlRules(workspace.config.baseRulesPath);
    const sharedRules = loadYamlRules(workspace.config.sharedRulesPath);

    return RuleSetSchema.parse({
        user_rules: userRules,
        shared_rules: sharedRules,
        base_rules: baseRules
    });
}

function loadYamlRules(path: string): Rule[] {
    if (!existsSync(path)) {
        return [];
    }
    const content = readFileSync(path, 'utf-8');
    const data = parse(content);
    if (!data) return [];

    // Support either a direct array or a wrapped object { rules: [...] }
    let rules: any[] = [];
    if (Array.isArray(data)) {
        rules = data;
    } else if (data && typeof data === 'object' && Array.isArray(data.rules)) {
        rules = data.rules;
    }

    return rules.map(r => RuleSchema.parse(r));
}
