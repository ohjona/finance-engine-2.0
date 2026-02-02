#!/usr/bin/env node
import { Command } from 'commander';
import { processMonth } from './commands/process.js';
import { addRule } from './commands/add-rule.js';

const program = new Command();

program
    .name('fineng')
    .description('Finance Engine CLI - Personal finance automation')
    .version('2.0.0');

program
    .command('process <month>')
    .description('Process a month of transactions (YYYY-MM format)')
    .option('--dry-run', 'Parse and analyze without writing files')
    .option('--force', 'Overwrite existing output for this month')
    .option('--yes', 'Auto-continue on errors (non-interactive)')
    .option('--llm', 'Enable LLM-assisted categorization')
    .option('--workspace <path>', 'Override workspace directory')
    .action(processMonth);

program
    .command('add-rule <pattern> <category>')
    .description('Add a categorization rule to user-rules.yaml')
    .option('--note <note>', 'Optional note for the rule')
    .option('--workspace <path>', 'Override workspace directory')
    .action(addRule);

program.parse();
