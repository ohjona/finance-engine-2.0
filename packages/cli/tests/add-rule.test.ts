import { describe, it, expect, vi, beforeEach } from 'vitest';
import { addRule } from '../src/commands/add-rule.js';
import * as detect from '../src/workspace/detect.js';
import * as paths from '../src/workspace/paths.js';
import * as config from '../src/workspace/config.js';
import * as yaml from '../src/yaml/rules.js';

vi.mock('../src/workspace/detect.js');
vi.mock('../src/workspace/paths.js');
vi.mock('../src/workspace/config.js');
vi.mock('../src/yaml/rules.js');

describe('addRule command', () => {
    beforeEach(() => {
        vi.clearAllMocks();

        // Default mocks
        vi.mocked(detect.detectWorkspaceRoot).mockReturnValue('/mock/root');
        vi.mocked(paths.resolveWorkspace).mockReturnValue({
            root: '/mock/root',
            config: {
                userRulesPath: '/mock/root/user-rules.yaml',
                accountsPath: '/mock/root/accounts.json',
                baseRulesPath: '',
                sharedRulesPath: '',
                outputDir: '',
            }
        } as any);
        vi.mocked(config.loadRules).mockReturnValue({
            user_rules: [],
            shared_rules: [],
            base_rules: []
        });
        vi.mocked(config.loadAccounts).mockReturnValue({
            accounts: {
                "200": { name: "Test Account", type: "expense" },
                "101": { name: "Existing", type: "expense" }
            }
        });
    });

    it('should reject patterns shorter than 5 characters (CA-3)', async () => {
        const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => { throw new Error('exit'); });

        await expect(addRule('abc', '101', {})).rejects.toThrow('exit');

        exitSpy.mockRestore();
    });

    it('should reject colliding patterns (CA-3)', async () => {
        vi.mocked(config.loadRules).mockReturnValue({
            user_rules: [{ pattern: 'STARBUCKS', category_id: 101, pattern_type: 'substring' }],
            shared_rules: [],
            base_rules: []
        });

        const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => { throw new Error('exit'); });

        // 'STARB' is a substring collision or vice-versa
        await expect(addRule('STARB', '102', {})).rejects.toThrow('exit');

        exitSpy.mockRestore();
    });

    it('should add valid, non-colliding patterns', async () => {
        await addRule('NEW_PATTERN', '200', { note: 'Test note' });

        expect(yaml.appendRuleToYaml).toHaveBeenCalledWith(
            expect.stringContaining('user-rules.yaml'),
            expect.objectContaining({
                pattern: 'NEW_PATTERN',
                category_id: 200,
                note: 'Test note'
            })
        );
    });
});
