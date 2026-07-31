/* eslint-env node */
module.exports = {
  root: true,
  env: {
    browser: true,
    es2022: true,
    node: true,
  },
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 'latest',
    sourceType: 'module',
    ecmaFeatures: { jsx: true },
  },
  plugins: ['@typescript-eslint', 'import', 'react', 'react-hooks'],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:react/recommended',
    'plugin:react-hooks/recommended',
    'plugin:import/recommended',
    'plugin:import/typescript',
    'prettier',
  ],
  settings: {
    react: { version: 'detect' },
    'import/resolver': {
      typescript: {
        project: ['./tsconfig.node.json', './tsconfig.web.json'],
      },
      node: true,
    },
  },
  rules: {
    'react/react-in-jsx-scope': 'off',
    'react/prop-types': 'off',
    '@typescript-eslint/no-unused-vars': [
      'error',
      { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
    ],
    'import/no-unresolved': 'off',
    'import/order': [
      'error',
      {
        groups: ['builtin', 'external', 'internal', 'parent', 'sibling', 'index'],
        'newlines-between': 'never',
        alphabetize: { order: 'asc', caseInsensitive: true },
      },
    ],
    'no-restricted-imports': [
      'error',
      {
        patterns: [
          {
            group: ['electron', 'electron/*'],
            message: 'Services must not import Electron. Keep Electron in main/index and ipc only.',
          },
        ],
      },
    ],
  },
  overrides: [
    {
      files: [
        'src/main/index.ts',
        'src/main/bootstrap.ts',
        'src/main/windows/**/*.ts',
        'src/main/ipc/**/*.ts',
        'src/preload/**/*.ts',
        'src/main/lib/logger.ts',
      ],
      rules: {
        'no-restricted-imports': 'off',
      },
    },
    {
      files: ['src/renderer/src/main.tsx'],
      rules: {
        'import/default': 'off',
        'import/no-named-as-default-member': 'off',
      },
    },
    {
      files: ['src/renderer/**/*.{ts,tsx}'],
      rules: {
        'no-restricted-imports': [
          'error',
          {
            paths: [
              {
                name: 'fs',
                message: 'Renderer must not import Node modules.',
              },
              {
                name: 'path',
                message: 'Renderer must not import Node modules.',
              },
              {
                name: 'better-sqlite3',
                message: 'Renderer must not import Node modules.',
              },
            ],
          },
        ],
      },
    },
  ],
  ignorePatterns: ['out/', 'release/', 'dist/', 'node_modules/', 'drizzle/', '*.cjs'],
}
