/**
 * Finance Engine CLI - Core Types
 */

export interface ProcessOptions {
    dryRun: boolean;
    force: boolean;
    yes: boolean;
    llm: boolean;
    workspace?: string;
}

export interface AddRuleOptions {
    note?: string;
    workspace?: string;
}

export interface WorkspaceConfig {
    accountsPath: string;
    userRulesPath: string;
    baseRulesPath: string;
    sharedRulesPath: string;
}

export interface Workspace {
    root: string;
    imports: string;
    outputs: string;
    archive: string;
    config: WorkspaceConfig;
}
