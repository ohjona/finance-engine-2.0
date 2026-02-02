import { parseDocument, isSeq, isMap } from 'yaml';
import { readFile, writeFile } from 'node:fs/promises';

/**
 * Appends a new categorization rule to a YAML file while preserving comments.
 * Per PRD §15.A: Round-trip YAML preservation.
 * B-2: Structure-aware appending with correct node creation for type safety.
 */
export async function appendRuleToYaml(
    filePath: string,
    rule: { pattern: string; category_id: number; note?: string; added_date?: string; source?: string }
): Promise<void> {
    let content = '';
    try {
        content = await readFile(filePath, 'utf8');
    } catch (err) {
        if ((err as any).code === 'ENOENT') {
            content = '# Categorization Rules\nrules:\n';
        } else {
            throw err;
        }
    }

    const doc = parseDocument(content || 'rules:');
    const root = doc.contents;

    if (isSeq(root)) {
        // Case 1: Top-level sequence
        (root as any).add(doc.createNode(rule));
    } else if (isMap(root)) {
        // Case 2: Top-level mapping
        let rules = root.get('rules');
        if (!rules) {
            // Case 2a: No rules key, create it
            (root as any).set('rules', doc.createNode([rule]));
        } else if (isSeq(rules)) {
            // Case 2b: rules key is a sequence
            (rules as any).add(doc.createNode(rule));
        } else {
            throw new Error(`Invalid YAML structure in ${filePath}: "rules" must be a list.`);
        }
    } else {
        // Case 3: Empty or other scalar (fallback)
        doc.set('rules', doc.createNode([rule]));
    }

    await writeFile(filePath, doc.toString());
}
