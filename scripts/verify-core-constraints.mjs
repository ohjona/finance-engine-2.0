#!/usr/bin/env node
/**
 * Verify @finance-engine/core architectural constraints.
 *
 * Constraints per IK A12.5, A12.8:
 * 1. No node:* imports (fs, path, process, crypto, etc.)
 * 2. No console.* calls (side effects)
 * 3. No require() calls
 *
 * Run: node scripts/verify-core-constraints.mjs
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const CORE_SRC = 'packages/core/src';

const FORBIDDEN_PATTERNS = [
  // Node.js built-in modules
  { pattern: /from\s+['"]node:/, message: 'node:* import' },
  { pattern: /from\s+['"]fs['"]/, message: 'fs import' },
  { pattern: /from\s+['"]path['"]/, message: 'path import' },
  { pattern: /from\s+['"]crypto['"]/, message: 'crypto import' },
  { pattern: /from\s+['"]process['"]/, message: 'process import' },
  { pattern: /require\s*\(\s*['"]/, message: 'require() call' },

  // Console side effects
  { pattern: /console\.(log|warn|error|info|debug)\s*\(/, message: 'console.* call' },

  // Process globals
  { pattern: /process\.(env|argv|cwd|exit)/, message: 'process.* access' },
];

function getAllFiles(dir, files = []) {
  try {
    const items = readdirSync(dir);
    for (const item of items) {
      const fullPath = join(dir, item);
      if (statSync(fullPath).isDirectory()) {
        getAllFiles(fullPath, files);
      } else if (item.endsWith('.ts')) {
        files.push(fullPath);
      }
    }
  } catch (e) {
    // Directory might not exist yet
  }
  return files;
}

function checkFile(filePath) {
  const content = readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');
  const violations = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1;

    for (const { pattern, message } of FORBIDDEN_PATTERNS) {
      if (pattern.test(line)) {
        violations.push({
          file: filePath,
          line: lineNum,
          message,
          content: line.trim(),
        });
      }
    }
  }

  return violations;
}

function main() {
  console.log('Verifying @finance-engine/core architectural constraints...\n');

  const files = getAllFiles(CORE_SRC);
  if (files.length === 0) {
    console.log('No files found in ' + CORE_SRC + '. Skipping verification.');
    process.exit(0);
  }

  console.log(`Checking ${files.length} TypeScript files...\n`);

  let allViolations = [];

  for (const file of files) {
    const violations = checkFile(file);
    allViolations = allViolations.concat(violations);
  }

  if (allViolations.length === 0) {
    console.log('✓ All architectural constraints satisfied!\n');
    console.log('Verified:');
    console.log('  - No node:* imports');
    console.log('  - No fs/path/crypto imports');
    console.log('  - No console.* calls');
    console.log('  - No process.* access');
    console.log('  - No require() calls');
    process.exit(0);
  } else {
    console.log(`✗ Found ${allViolations.length} violation(s):\n`);
    for (const v of allViolations) {
      console.log(`  ${v.file}:${v.line}`);
      console.log(`    ${v.message}: ${v.content}\n`);
    }
    process.exit(1);
  }
}

main();
