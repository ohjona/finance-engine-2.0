import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { appendRuleToYaml } from '../src/yaml/rules.js';
import * as fs from 'node:fs/promises';
import { parseDocument } from 'yaml';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TEMP_RULES_FILE = join(__dirname, 'temp-rules.yaml');

describe('YAML Rule Appending', () => {
    beforeEach(async () => {
        const initialContent = `
# User rules for categorization
rules:
  - pattern: "existing pattern"
    category_id: 101
    note: "pre-existing rule"
`;
        await fs.writeFile(TEMP_RULES_FILE, initialContent, 'utf8');
    });

    afterEach(async () => {
        try {
            await fs.unlink(TEMP_RULES_FILE);
        } catch (e) {
            // Ignore if file doesn't exist
        }
    });

    it('should append a new rule while preserving comments and structure', async () => {
        const newRule = {
            pattern: "taco bell",
            category_id: 200,
            note: "New rule",
            added_date: "2026-02-02"
        };

        await appendRuleToYaml(TEMP_RULES_FILE, newRule);

        const updatedContent = await fs.readFile(TEMP_RULES_FILE, 'utf8');
        const doc = parseDocument(updatedContent);

        // Assertions
        expect(updatedContent).toContain('# User rules for categorization');
        expect(updatedContent).toContain('existing pattern');
        expect(updatedContent).toContain('taco bell');

        const rules = (doc.get('rules') as any).toJSON();
        expect(rules).toHaveLength(2);
        expect(rules[1].pattern).toBe('taco bell');
        expect(rules[1].category_id).toBe(200);
    });

    it('should create "rules" key if it doesn\'t exist', async () => {
        await fs.writeFile(TEMP_RULES_FILE, '# Empty file\n', 'utf8');

        await appendRuleToYaml(TEMP_RULES_FILE, {
            pattern: "new",
            category_id: 1,
            added_date: "2026-02-02"
        });

        const updatedContent = await fs.readFile(TEMP_RULES_FILE, 'utf8');
        expect(updatedContent).toContain('pattern: new');
    });

    it('should append to top-level sequence and preserve formatting', async () => {
        const initialContent = `# comment A
- pattern: "ONE"
  category_id: 100
# comment B
- pattern: "TWO"
  category_id: 200
`;
        await fs.writeFile(TEMP_RULES_FILE, initialContent, 'utf8');

        const newRule = {
            pattern: "THREE",
            category_id: 300,
            added_date: "2026-02-02"
        };

        await appendRuleToYaml(TEMP_RULES_FILE, newRule);

        const updatedContent = await fs.readFile(TEMP_RULES_FILE, 'utf8');

        expect(updatedContent).toContain('# comment A');
        expect(updatedContent).toContain('# comment B');
        expect(updatedContent).toContain('pattern: "ONE"');
        expect(updatedContent).toContain('pattern: "TWO"');
        expect(updatedContent).toContain('pattern: THREE');

        const doc = parseDocument(updatedContent);
        expect((doc.contents as any).toJSON()).toHaveLength(3);
    });
});
