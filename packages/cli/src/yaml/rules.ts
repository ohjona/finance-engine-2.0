import { parseDocument, isSeq } from 'yaml';
import { readFile, writeFile } from 'node:fs/promises';

/**
 * Appends a new categorization rule to a YAML file while preserving comments.
 * Per PRD §15.A: Round-trip YAML preservation.
 */
export async function appendRuleToYaml(
    filePath: string,
    rule: { pattern: string; category_id: number; note?: string; added_date?: string }
): Promise<void> {
    const content = await readFile(filePath, 'utf8');
    const doc = parseDocument(content);

    // Expected structure:
    // rules:
    //   - pattern: ...
    //     category_id: ...

    const rules = doc.get('rules');

    if (!rules) {
        // If 'rules' key doesn't exist, create it as a sequence.
        doc.set('rules', [rule]);
    } else if (isSeq(rules)) {
        // Add to existing sequence.
        rules.add(rule);
    } else {
        throw new Error(`Invalid YAML structure in ${filePath}: "rules" must be a list.`);
    }

    await writeFile(filePath, doc.toString());
}
