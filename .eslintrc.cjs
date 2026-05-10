'use strict';

/** @type {import('eslint').Linter.Config} */
module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
    project: ['./tsconfig.json', './tsconfig.test.json'],
  },
  plugins: ['@typescript-eslint', 'import'],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:@typescript-eslint/recommended-requiring-type-checking',
    'plugin:import/recommended',
    'plugin:import/typescript',
    'prettier',
  ],
  rules: {
    '@typescript-eslint/explicit-function-return-type': 'warn',
    '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    '@typescript-eslint/no-explicit-any': 'error',
    'import/no-cycle': ['error', { maxDepth: 3 }],
    'no-restricted-imports': [
      'error',
      {
        patterns: [
          {
            group: ['*/hookAdapters*', '*/slashCommands*'],
            importNames: ['*'],
            message: 'hookAdapters and slashCommands must not cross-import (TS-2 §2.3)',
          },
        ],
      },
    ],
  },
  settings: {
    'import/resolver': {
      typescript: {
        project: ['./tsconfig.json', './tsconfig.test.json'],
      },
    },
  },
  overrides: [
    {
      files: ['tests/**/*.ts'],
      rules: {
        '@typescript-eslint/no-explicit-any': 'off',
        '@typescript-eslint/no-unsafe-assignment': 'off',
        '@typescript-eslint/no-unsafe-call': 'off',
        '@typescript-eslint/no-unsafe-member-access': 'off',
        '@typescript-eslint/no-unsafe-return': 'off',
        '@typescript-eslint/no-unsafe-argument': 'off',
        // Mock transports / fake handlers must match async interfaces even
        // when the body is synchronous; flagging this in tests is noise.
        '@typescript-eslint/require-await': 'off',
        // Test callbacks (it/describe/etc.) are inferred well enough.
        '@typescript-eslint/explicit-function-return-type': 'off',
        '@typescript-eslint/no-var-requires': 'off',
      },
    },
  ],
};
