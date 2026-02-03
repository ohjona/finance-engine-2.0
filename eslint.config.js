import globals from 'globals';
import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
    eslint.configs.recommended,
    ...tseslint.configs.recommended,
    {
        files: ['packages/*/src/**/*.ts'],
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: 'module',
            globals: {
                ...globals.node,
            },
        },
        rules: {
            '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
            '@typescript-eslint/explicit-function-return-type': 'off',
            '@typescript-eslint/no-explicit-any': 'off', // Allow any for now to facilitate upgrade
            'no-console': 'error',
        },
    },
    {
        // Allow console in CLI package only
        files: ['packages/cli/src/**/*.ts'],
        rules: {
            'no-console': 'off',
        },
    },
    {
        ignores: ['**/dist/**', '**/node_modules/**'],
    }
);
